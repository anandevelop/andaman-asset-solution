/**
 * scripts/link-scan.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CLI entry point for lib/admin/link-graph.ts's scanAndPersistLinkGraph() —
 * the same scan the "Rescan links" button on /admin/seo/keywords and
 * /admin/seo/links triggers, runnable from a terminal or a deploy hook.
 *
 * Cannot statically `import` lib/admin/link-graph.ts: that file starts with
 * `import "server-only"`, which throws the moment it loads outside a React
 * Server Component, and ES module evaluation runs an imported module's
 * top-level code before this script's own loadEnv() call regardless of
 * source-line order. scripts/spaces-runtime.ts's loadS3Lib() solves the
 * identical problem for lib/s3.ts by pre-seeding Node's require cache with
 * an empty module for server-only's resolved id, then dynamically
 * import()-ing the real target — the same trick, applied here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import path from "node:path";
import { createRequire } from "node:module";
import { loadEnv, OK, FAIL, RESET } from "./spaces-runtime";

function loadLinkGraphLib(): Promise<typeof import("../lib/admin/link-graph")> {
  const require_ = createRequire(path.join(process.cwd(), "package.json"));
  const serverOnlyId = require_.resolve("server-only");

  require_.cache[serverOnlyId] = {
    id: serverOnlyId,
    filename: serverOnlyId,
    loaded: true,
    exports: {},
  } as NodeModule;

  return import("../lib/admin/link-graph");
}

loadEnv();

async function main() {
  const { scanAndPersistLinkGraph } = await loadLinkGraphLib();
  const { prisma } = await import("../lib/prisma");

  try {
    const result = await scanAndPersistLinkGraph();
    console.log(`\n${OK} Link graph scan complete${RESET}\n`);
    console.log(`  pages scanned   ${result.pagesScanned}`);
    console.log(`  links written   ${result.linksWritten}`);
    console.log(`  scanned at      ${result.scannedAt.toISOString()}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`${FAIL} Scan failed:${RESET}`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
