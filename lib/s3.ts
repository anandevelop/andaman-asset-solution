/**
 * lib/s3.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Presigned direct-to-S3 uploads.
 *
 * The browser PUTs straight to S3; the server only ever signs a URL. That
 * matters for more than elegance — a Next.js server action or route handler
 * buffers the whole request body in memory, so proxying a 12MB villa photo
 * through it costs 12MB of server RAM per concurrent upload and runs into
 * the platform body-size limit at around 4.5MB anyway.
 *
 * What comes back is a pair: the signed PUT URL (short-lived, S3 host) and
 * the permanent CloudFront URL that goes into the database. The bucket
 * itself stays private behind an Origin Access Control — nothing is ever
 * read directly from S3.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Five minutes: long enough for a slow phone upload, short enough that a
 *  leaked URL is worthless by the time anyone finds it. */
const EXPIRES_IN_SECONDS = 5 * 60;

/**
 * Raster formats, PDF for sales brochures, plus two video formats for the
 * homepage story banner's VIDEO slides (see HeroStorySlide in
 * schema.prisma).
 *
 * SVG is excluded deliberately — it is a script container, and one served
 * from our own CDN domain would be same-origin with the site.
 *
 * PDF is a considered exception. It can also carry JavaScript, but browsers
 * open it in a sandboxed viewer rather than the page context, and the
 * `Content-Disposition: attachment` set on brochure uploads below means it
 * downloads rather than renders inline. Only signed-in admins can upload.
 *
 * mp4/webm only, no mov/avi/etc — those two cover every modern browser's
 * native <video> playback with no client-side transcoding, and a narrow
 * allowlist here is what keeps buildObjectKey's extension trustworthy.
 */
export const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
} as const;

export type AllowedContentType = keyof typeof ALLOWED_CONTENT_TYPES;

/** 15MB. Above this the answer is "resize it first", not "wait longer". */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** A print-resolution brochure is legitimately larger than a photograph. */
export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

/** A few seconds of 1080p story video is legitimately larger than either. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function isAllowedContentType(value: string): value is AllowedContentType {
  return value in ALLOWED_CONTENT_TYPES;
}

export function isDocumentContentType(value: string): boolean {
  return value === "application/pdf";
}

export function isVideoContentType(value: string): boolean {
  return value === "video/mp4" || value === "video/webm";
}

/** Size cap for a given type — documents and videos get a larger allowance
 *  than a plain photograph, videos largest of all. */
export function maxBytesFor(contentType: string): number {
  if (isVideoContentType(contentType)) return MAX_VIDEO_BYTES;
  return isDocumentContentType(contentType) ? MAX_DOCUMENT_BYTES : MAX_UPLOAD_BYTES;
}

// ── Configuration ───────────────────────────────────────────────────────

export type S3Config = {
  region: string;
  bucket: string;
  cloudfrontDomain: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
};

/**
 * Read and validate configuration at call time rather than module load.
 * A missing key should fail the one request that needs S3, not crash the
 * whole server on boot — the public site does not depend on uploads.
 */
export function readS3Config(): S3Config | null {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.AWS_ENDPOINT;

  if (!region || !bucket || !cloudfrontDomain || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    region,
    bucket,
    // Tolerate a pasted "https://d123.cloudfront.net/" — the env var wants
    // a bare host, but that is an easy thing to get wrong once.
    cloudfrontDomain: cloudfrontDomain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    accessKeyId,
    secretAccessKey,
    ...(endpoint && { endpoint }),
  };
}

export function isS3Configured(): boolean {
  return readS3Config() !== null;
}

// ── Client ──────────────────────────────────────────────────────────────

let cachedClient: S3Client | null = null;

function getClient(config: S3Config): S3Client {
  // One client per process: it holds a connection pool, and constructing a
  // fresh one per request leaks sockets under load.
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && {
        endpoint: config.endpoint,
        forcePathStyle: true, // Required for most S3-compatible providers (Supabase, MinIO, R2, etc.)
        requestChecksumCalculation: "WHEN_REQUIRED", // Fixes 403 errors with Supabase by disabling auto-CRC32
      }),
    });
  }
  return cachedClient;
}

// ── Key generation ──────────────────────────────────────────────────────

/**
 * Normalise a folder segment into something safe for an object key.
 * Slashes, dots and control characters are stripped so a caller cannot
 * traverse out of its own prefix by passing "../../".
 */
function sanitizeSegment(value: string, fallback: string): string {
  const clean = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return clean.length > 0 ? clean : fallback;
}

/**
 * Build the object key: `projects/{slug}/{uuid}.{ext}`.
 *
 * The extension is derived from the declared content type, never from the
 * uploaded filename — a file called "photo.jpg.html" must not become an
 * .html object served from our CDN domain.
 *
 * The UUID means the same photo uploaded twice produces two objects rather
 * than one silently overwriting the other, and it keeps the key
 * unguessable.
 */
export function buildObjectKey(
  contentType: AllowedContentType,
  options: { prefix?: string; slug?: string } = {},
): string {
  const prefix = sanitizeSegment(options.prefix ?? "projects", "projects");
  const slug = sanitizeSegment(options.slug ?? "general", "general");
  const extension = ALLOWED_CONTENT_TYPES[contentType];

  return `${prefix}/${slug}/${randomUUID()}.${extension}`;
}

/** Object key → the public URL stored in the database. */
export function toCloudFrontUrl(key: string, config?: S3Config): string {
  const resolved = config ?? readS3Config();
  if (!resolved) throw new Error("S3_NOT_CONFIGURED");

  return `https://${resolved.cloudfrontDomain}/${key.replace(/^\/+/, "")}`;
}

// ── Presigning ──────────────────────────────────────────────────────────

export type PresignedUpload = {
  /** Short-lived S3 URL the browser PUTs the file to. */
  uploadUrl: string;
  /** Permanent CloudFront URL — this is what gets saved. */
  publicUrl: string;
  key: string;
  expiresIn: number;
  /** The browser must send exactly this, or the signature will not match. */
  contentType: AllowedContentType;
};

/**
 * Sign a single-object PUT.
 *
 * ContentType is part of the signature, so the browser cannot upload a
 * different type than the one authorised here. ContentLength is not signed
 * — S3 would reject a mismatch outright, and browsers do not let us set it
 * reliably — so the size cap is enforced client-side and, properly, by a
 * bucket policy condition on `s3:content-length-range`.
 */
// ── Connectivity ────────────────────────────────────────────────────────

export type S3Reachability =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: "not_configured" | "unreachable" | "forbidden"; detail?: string };

/**
 * Prove the bucket is actually reachable with the configured credentials.
 *
 * `isS3Configured()` only checks that five environment variables are
 * non-empty — it would report healthy with a revoked key or a deleted
 * bucket, right up until an editor tries to upload. HeadBucket is the
 * cheapest call that exercises credentials, region and bucket existence in
 * one round trip; it transfers no data and costs nothing.
 *
 * A 403 is reported separately from a network failure because they need
 * different fixes: one is an IAM policy, the other is a VPC route.
 */
export async function checkS3Reachable(
  timeoutMs = 3_000,
): Promise<S3Reachability> {
  const config = readS3Config();
  if (!config) return { ok: false, reason: "not_configured" };

  const startedAt = Date.now();

  try {
    await Promise.race([
      getClient(config).send(new HeadBucketCommand({ Bucket: config.bucket })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs),
      ),
    ]);

    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;

    if (status === 403) {
      return { ok: false, reason: "forbidden", detail: "check the IAM policy" };
    }

    return {
      ok: false,
      reason: "unreachable",
      // First line only — an AWS SDK error can be long and occasionally
      // echoes request parameters.
      detail:
        error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : undefined,
    };
  }
}

export async function getPresignedUploadUrl(options: {
  contentType: AllowedContentType;
  prefix?: string;
  slug?: string;
}): Promise<PresignedUpload> {
  const config = readS3Config();
  if (!config) throw new Error("S3_NOT_CONFIGURED");

  const key = buildObjectKey(options.contentType, {
    prefix: options.prefix,
    slug: options.slug,
  });

  const isDocument = isDocumentContentType(options.contentType);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: options.contentType,
    // A year: these objects are immutable by construction, since every
    // upload gets a fresh UUID key.
    CacheControl: "public, max-age=31536000, immutable",

    // Force a download for documents, and give the file a human name — a
    // UUID.pdf in the downloads folder is useless a week later. This is
    // also what keeps a PDF out of the page's own origin.
    ...(isDocument
      ? {
          ContentDisposition: `attachment; filename="${
            sanitizeSegment(options.slug ?? "brochure", "brochure")
          }-brochure.pdf"`,
        }
      : {}),
  });

  const uploadUrl = await getSignedUrl(getClient(config), command, {
    expiresIn: EXPIRES_IN_SECONDS,
    signableHeaders: new Set(["content-type"]), // Required for Supabase S3 API
  });

  return {
    uploadUrl,
    publicUrl: toCloudFrontUrl(key, config),
    key,
    expiresIn: EXPIRES_IN_SECONDS,
    contentType: options.contentType,
  };
}
