/**
 * scripts/warm-images.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Fills the image optimizer's cache before visitors need it. Run by
 * scripts/cron.mjs when the scheduler starts (that is, after every deploy)
 * and again nightly.
 *
 * WHY
 *
 * Every <Image> on the site is served by /_next/image, which encodes the
 * photo the first time each width is asked for. Measured on staging
 * (2026-10-12): 0.6 to 1.9 s for a cold AVIF at 640 to 1200px, up to 4 s at
 * the largest sizes, and about 0.1 s once cached. One photo has around
 * eight widths in its srcset, and a phone, a laptop and a retina desktop
 * each pick a different one, so a page could stay "cold" for days of real
 * traffic. This walks the sitemap, collects every /_next/image URL each
 * page's HTML offers in src and srcset, and requests each one once.
 *
 * WHAT IT COSTS
 *
 * CPU on the app container, which is why it runs two requests at a time
 * and not forty. With the cache on a volume (docker-compose.prod.yml,
 * andaman_image_cache) a run after a deploy is mostly cache hits and
 * finishes in seconds. Without the volume every deploy re-encodes
 * everything, which is the cost the volume removes.
 *
 * Node built-ins only, like cron.mjs: the runtime image has no npm.
 * ─────────────────────────────────────────────────────────────────────────
 */

const ACCEPT = "image/avif,image/webp,image/*,*/*;q=0.8";
const MAX_PAGES = 300;
const CONCURRENCY = 2;

/** /_next/image URLs in a page's HTML, from src and every srcset entry. */
export function imageUrlsIn(html) {
  const found = new Set();
  for (const match of html.matchAll(/\/_next\/image\?url=[^"'\s,]+/g)) {
    found.add(match[0].replace(/&amp;/g, "&"));
  }
  return [...found];
}

/** Paths from a sitemap, whatever host it names. */
export function pathsIn(sitemapXml) {
  const paths = new Set();
  for (const match of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      paths.add(new URL(match[1].trim()).pathname);
    } catch {
      /* not a URL — skip it */
    }
  }
  return [...paths];
}

async function pool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Walk the site at `base` and request every optimized image once.
 * Returns counts for the log line; never throws.
 */
export async function warmImages(base, log = console.log) {
  const started = Date.now();
  const headers = { "user-agent": "andaman-image-warmer" };
  const stats = { pages: 0, images: 0, miss: 0, hit: 0, failed: 0 };

  let paths;
  try {
    const sitemap = await fetch(`${base}/sitemap.xml`, { headers, signal: AbortSignal.timeout(60_000) });
    paths = pathsIn(await sitemap.text()).slice(0, MAX_PAGES);
  } catch (error) {
    log(`image warm-up skipped: sitemap unreachable (${error instanceof Error ? error.message : error})`);
    return stats;
  }

  const images = new Set();
  await pool(paths, CONCURRENCY, async (path) => {
    try {
      const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return;
      stats.pages += 1;
      for (const url of imageUrlsIn(await response.text())) images.add(url);
    } catch {
      /* one page failing does not stop the rest */
    }
  });

  await pool([...images], CONCURRENCY, async (url) => {
    try {
      const response = await fetch(`${base}${url}`, {
        headers: { ...headers, accept: ACCEPT },
        signal: AbortSignal.timeout(120_000),
      });
      await response.arrayBuffer();
      stats.images += 1;
      const cache = response.headers.get("x-nextjs-cache");
      if (cache === "HIT") stats.hit += 1;
      else stats.miss += 1;
      if (!response.ok) stats.failed += 1;
    } catch {
      stats.failed += 1;
    }
  });

  log(
    `image warm-up: ${stats.pages} pages, ${stats.images} images (${stats.miss} encoded, ${stats.hit} already cached, ${stats.failed} failed) in ${Math.round((Date.now() - started) / 1000)}s`,
  );
  return stats;
}
