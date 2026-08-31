/**
 * scripts/spaces-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Proves the media storage actually works, end to end, before an editor
 * finds out it does not.
 *
 * Five environment variables being present is not the same as uploads
 * working. The failure that matters — an object that stores fine and then
 * 403s for every visitor because it was written without a public ACL — is
 * invisible from the admin, where the image renders from the freshly
 * uploaded blob. So this does the whole round trip: sign, PUT the way the
 * browser does, fetch back anonymously, delete.
 *
 * Run with:  npm run spaces:check
 * ─────────────────────────────────────────────────────────────────────────
 */

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv, loadS3Lib, OK, FAIL, DIM, RESET } from "./spaces-runtime";

loadEnv();

const fixes: string[] = [];

async function main() {
  console.log("\n  Media storage check\n");

  // Loaded after loadEnv, because lib/s3.ts reads the environment.
  const { checkS3Reachable, getPresignedUploadUrl, readS3Config } = await loadS3Lib();

  const config = readS3Config();

  if (!config) {
    console.log(`  ${FAIL} Not configured.`);
    fixes.push(
      "Set DO_SPACES_REGION, DO_SPACES_BUCKET, DO_SPACES_ACCESS_KEY_ID,",
      "  DO_SPACES_SECRET_ACCESS_KEY and NEXT_PUBLIC_MEDIA_DOMAIN in .env",
    );
    return report();
  }

  console.log(`  ${DIM}bucket   ${RESET}${config.bucket}`);
  console.log(`  ${DIM}endpoint ${RESET}${config.endpoint ?? "(AWS default)"}`);
  console.log(`  ${DIM}public   ${RESET}https://${config.mediaDomain}\n`);

  // ── 1. Credentials and bucket ─────────────────────────────────────────
  const reachable = await checkS3Reachable(8_000);

  if (!reachable.ok) {
    console.log(`  ${FAIL} Bucket unreachable (${reachable.reason})`);
    if (reachable.detail) console.log(`    ${DIM}${reachable.detail}${RESET}`);
    fixes.push(
      reachable.reason === "forbidden"
        ? "The key is valid but not allowed on this Space — check the key's scope."
        : "Check DO_SPACES_ENDPOINT, the bucket name, and that the key is not revoked.",
    );
    return report();
  }

  console.log(`  ${OK} Credentials accepted (${reachable.latencyMs}ms)`);

  // ── 2. Sign and upload exactly as the browser would ───────────────────
  const presigned = await getPresignedUploadUrl({
    contentType: "image/png",
    prefix: "diagnostics",
    slug: "spaces-check",
  });

  // Smallest valid PNG: 1×1, transparent.
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  const put = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: presigned.headers,
    body: pixel,
  });

  if (!put.ok) {
    console.log(`  ${FAIL} Upload refused (HTTP ${put.status})`);
    console.log(`    ${DIM}${(await put.text()).slice(0, 300)}${RESET}`);
    fixes.push(
      "A 403 here usually means the signed headers were not sent verbatim,",
      "  or the key lacks write access to this Space.",
    );
    return report();
  }

  console.log(`  ${OK} Upload accepted`);

  // ── 3. Read it back the way a visitor would ───────────────────────────
  const publicRead = await fetch(presigned.publicUrl);

  if (!publicRead.ok) {
    console.log(`  ${FAIL} Not publicly readable (HTTP ${publicRead.status})`);
    fixes.push(
      "The object uploaded but visitors cannot read it. Either the ACL is not",
      "  being applied (check SPACES_OBJECT_ACL) or NEXT_PUBLIC_MEDIA_DOMAIN",
      `  points at the wrong host — it should serve ${presigned.key}`,
    );
  } else {
    console.log(`  ${OK} Publicly readable at ${presigned.publicUrl}`);
  }

  // ── 4. The browser's view: CORS preflight ─────────────────────────────
  //
  // Everything above ran from node, which has no same-origin policy. The
  // admin uploader is a browser, and a browser sends an OPTIONS preflight
  // before a cross-origin PUT with custom headers. A Space with no CORS
  // rule answers that preflight with nothing useful, the PUT never leaves
  // the browser, and the only symptom is "Upload failed" in the UI.
  /*
    localhost is what the admin is opened on today, so a missing rule there
    is a broken upload right now. The production origin is only reachable
    once the site is deployed — before that it is a reminder, not a fault,
    and a red cross for something that cannot be exercised yet trains people
    to ignore the output. Run with NODE_ENV=production to make it binding.
  */
  const deployed = process.env.NODE_ENV === "production";
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  const origins: { url: string; required: boolean }[] = [
    { url: "http://localhost:3000", required: true },
    ...(site ? [{ url: site, required: deployed }] : []),
  ];

  for (const { url: origin, required } of origins) {
    const preflight = await fetch(presigned.uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        // Exactly what getPresignedUploadUrl signs, and therefore exactly
        // what the browser will ask permission to send.
        "Access-Control-Request-Headers": "content-type,x-amz-acl",
      },
    }).catch(() => null);

    const allowed = preflight?.headers.get("access-control-allow-origin");
    const allowedHeaders =
      preflight?.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";

    const originOk = allowed === "*" || allowed === origin;
    const headersOk =
      allowedHeaders.includes("*") ||
      (allowedHeaders.includes("content-type") && allowedHeaders.includes("x-amz-acl"));

    if (originOk && headersOk) {
      console.log(`  ${OK} CORS allows ${origin}`);
      continue;
    }

    if (!required) {
      console.log(`  ${DIM}·${RESET} CORS not set for ${origin} ${DIM}(add it before deploying)${RESET}`);
      continue;
    }

    console.log(`  ${FAIL} CORS blocks ${origin}`);

    if (!originOk) {
      console.log(
        `    ${DIM}preflight returned allow-origin: ${allowed ?? "(none)"}${RESET}`,
      );
    } else {
      console.log(
        `    ${DIM}allow-headers: ${allowedHeaders || "(none)"} — needs content-type and x-amz-acl${RESET}`,
      );
    }

    fixes.push(
      `Add a CORS rule to the Space for ${origin}:`,
      "  DigitalOcean → Spaces → andamanasset-media → Settings → CORS",
      "  Origin: that URL · Methods: GET, HEAD, PUT · Allowed headers: *",
      "  (or run `npm run spaces:cors` with a full-access key)",
    );
  }

  // ── 5. Tidy up ────────────────────────────────────────────────────────
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint && { endpoint: config.endpoint, forcePathStyle: true }),
  });

  await client
    .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: presigned.key }))
    .then(() => console.log(`  ${OK} Test object removed`))
    .catch(() => console.log(`  ${DIM}  (left ${presigned.key} behind)${RESET}`));

  report();
}

function report() {
  if (fixes.length === 0) {
    console.log(`\n  ${OK} Uploads are working.\n`);
    return;
  }

  console.log("\n  Next steps:\n");
  for (const fix of fixes) console.log(`    ${fix}`);
  console.log("");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\n  spaces:check crashed:", error);
  process.exit(1);
});
