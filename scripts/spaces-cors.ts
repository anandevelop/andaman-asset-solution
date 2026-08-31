/**
 * scripts/spaces-cors.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Applies the CORS rule the admin uploader needs, over the S3 API.
 *
 * Without it the browser's preflight for a direct-to-Spaces PUT gets no
 * answer, the upload never leaves the page, and the only symptom is
 * "Upload failed" in the admin — with nothing in the server log, because
 * the request never reached a server of ours.
 *
 * Doing it here rather than in the DigitalOcean console means the rule is
 * written down, reviewable, and reproducible on the next Space someone
 * creates. It is also the only way to set one from CI.
 *
 * Run with:  npm run spaces:cors
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { loadEnv, loadS3Lib, OK, FAIL, DIM, RESET } from "./spaces-runtime";

loadEnv();

/**
 * Origins allowed to upload.
 *
 * Deliberately explicit rather than "*": a wildcard would let any page on
 * the internet make authenticated-looking cross-origin requests to the
 * bucket from a visitor's browser. Reads are unaffected either way —
 * <img src> is not a CORS request.
 */
function allowedOrigins(): string[] {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  const origins = new Set<string>(["http://localhost:3000"]);

  if (site) {
    origins.add(site);
    // www and apex are separate origins to a browser, and which one the
    // admin is opened on is a DNS decision made elsewhere.
    origins.add(
      site.includes("://www.")
        ? site.replace("://www.", "://")
        : site.replace("://", "://www."),
    );
  }

  return [...origins];
}

const RULES: CORSRule[] = [
  {
    AllowedOrigins: allowedOrigins(),
    // PUT uploads, GET/HEAD so a fetch() against an uploaded object (rather
    // than an <img>) is not blocked either.
    AllowedMethods: ["GET", "HEAD", "PUT"],
    // The signed headers travel with the PUT — content-type and x-amz-acl —
    // and a browser asks permission for each by name.
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    // An hour: long enough that a burst of uploads sends one preflight, short
    // enough that fixing this rule takes effect the same afternoon.
    MaxAgeSeconds: 3600,
  },
];

async function main() {
  console.log("\n  Spaces CORS\n");

  const { readS3Config } = await loadS3Lib();
  const config = readS3Config();

  if (!config) {
    console.log(`  ${FAIL} Storage is not configured — check .env\n`);
    process.exitCode = 1;
    return;
  }

  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint && { endpoint: config.endpoint, forcePathStyle: true }),
  });

  // Show what is there first — this command overwrites the whole rule set,
  // so anything already configured deserves to be seen before it goes.
  const existing = await client
    .send(new GetBucketCorsCommand({ Bucket: config.bucket }))
    .then((response) => response.CORSRules ?? [])
    .catch(() => [] as CORSRule[]);

  if (existing.length > 0) {
    console.log(`  ${DIM}replacing ${existing.length} existing rule(s):${RESET}`);
    for (const rule of existing) {
      console.log(
        `  ${DIM}  ${(rule.AllowedMethods ?? []).join(",")} from ${(rule.AllowedOrigins ?? []).join(", ")}${RESET}`,
      );
    }
    console.log("");
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: { CORSRules: RULES },
    }),
  );

  console.log(`  ${OK} CORS applied to ${config.bucket}`);
  for (const origin of allowedOrigins()) {
    console.log(`  ${DIM}  GET, HEAD, PUT from ${origin}${RESET}`);
  }

  console.log(`\n  Verify with:  npm run spaces:check\n`);
}

main().catch((error) => {
  const status =
    typeof error === "object" && error !== null && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;

  console.error("\n  spaces:cors failed:", error instanceof Error ? error.message : error);

  // Only one of these is actionable at a time, and guessing wrong sends the
  // reader to the wrong console.
  console.error(
    status === 403
      ? "  The key cannot change bucket settings — use one with full access,\n" +
          "  or add the rule in the DigitalOcean console.\n"
      : "  Could not reach the Spaces API — check the endpoint and the network.\n",
  );
  process.exit(1);
});
