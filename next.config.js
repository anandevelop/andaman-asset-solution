const withNextIntl = require("next-intl/plugin")("./i18n.ts");

/**
 * The media host is where every uploaded asset is served from — currently a
 * DigitalOcean Space. next/image refuses any host not listed here, so a
 * missing env var would silently break every admin-uploaded image — hence
 * the explicit build-time warning rather than a quiet fallback.
 *
 * NEXT_PUBLIC_*, so it is baked in at build time: a container built without
 * it cannot be fixed by setting it at runtime.
 */
const mediaDomain = process.env.NEXT_PUBLIC_MEDIA_DOMAIN
  ? process.env.NEXT_PUBLIC_MEDIA_DOMAIN.replace(/^https?:\/\//, "").split("/")[0]
  : null;

/**
 * The Spaces origin host behind the CDN alias.
 *
 * lib/s3.ts saves an absolute publicUrl per upload rather than a bare key,
 * so every row written before NEXT_PUBLIC_MEDIA_DOMAIN was switched to the
 * CDN alias still points at ...sgp1.digitaloceanspaces.com. Both names
 * serve the same objects, and dropping the origin would break every one of
 * those rows — the same trap that kept the retired Supabase hosts in this
 * list for as long as it did. `npm run media:legacy` is what tells you
 * whether a host is actually safe to remove.
 */
const mediaOriginDomain =
  mediaDomain && mediaDomain.includes(".cdn.digitaloceanspaces.com")
    ? mediaDomain.replace(".cdn.digitaloceanspaces.com", ".digitaloceanspaces.com")
    : null;

/**
 * STOPGAP — put back 2026-09-01 after `npm run dev` 500'd on a real row:
 * some banner/general image still stores a `nwgjexifvlryisfxhhxa.supabase.co`
 * URL from before the move to Spaces (lib/s3.ts stores an absolute
 * publicUrl per upload, so nothing rewrote it when the host changed).
 *
 * Run `npm run media:legacy` to find every row still pointing at this host,
 * re-upload those images through /admin, confirm the scan comes back clean,
 * and only then delete this block. Do not remove it "because it looks
 * unused" without running that check first — that is exactly how this
 * broke the first time.
 */
const legacyMediaHosts = [
  "nwgjexifvlryisfxhhxa.supabase.co",
  "nwgjexifvlryisfxhhxa.storage.supabase.co",
];

/** Every host that may serve an uploaded image, newest alias first. */
const mediaHosts = [mediaDomain, mediaOriginDomain, ...legacyMediaHosts].filter(Boolean);

if (!mediaDomain && process.env.NODE_ENV === "production") {
  console.warn(
    "\n⚠  NEXT_PUBLIC_MEDIA_DOMAIN is not set.\n" +
      "   Uploaded images will fail to render through next/image.\n",
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Content Security Policy
//
// Ships as Report-Only. Every third party this site depends on — GA4, Meta
// Pixel, reCAPTCHA, the Maps embed — fails *silently* under a wrong CSP:
// the page still renders, the script just never runs, and nobody notices
// until a month of conversion data is missing. Report-Only surfaces the
// violations in the browser console and at report-uri without blocking
// anything, so the allowlist can be corrected against real traffic first.
//
// Flip CSP_ENFORCE=true once a week or two of production reports is clean.
//
// `unsafe-inline` on script-src is unavoidable here. The alternative is a
// per-request nonce generated in middleware, which forces every page out of
// static generation — a bad trade for a marketing site whose whole point is
// being served from cache. It is also why `strict-dynamic` is absent:
// browsers ignore `unsafe-inline` when it is present.
// ─────────────────────────────────────────────────────────────────────────

const CSP_DIRECTIVES = {
  "default-src": ["'self'"],

  "script-src": [
    "'self'",
    "'unsafe-inline'",
    /*
      next/script and the framework's own hydration payload.

      It also happens to be what permits WebAssembly.instantiate, which
      pdf.js uses to decode JPEG 2000 images in some PDFs. If this token is
      ever dropped — a good goal — add 'wasm-unsafe-eval' in the same
      change, or those brochures render blank pages with no error.
    */
    "'unsafe-eval'",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://connect.facebook.net",
    "https://www.google.com",
    "https://www.gstatic.com",
  ],

  // Tailwind is compiled, but React still sets style attributes inline and
  // next/image writes inline sizing on fill images.
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],

  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],

  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://images.unsplash.com",
    "https://source.unsplash.com",
    // Analytics tracking pixels.
    "https://www.google-analytics.com",
    "https://www.facebook.com",
    ...mediaHosts.map((host) => `https://${host}`),
  ],

  "connect-src": [
    "'self'",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://stats.g.doubleclick.net",
    "https://connect.facebook.net",
    // Browser PUTs straight to the Space via the presigned URL.
    "https://*.digitaloceanspaces.com",
    "https://*.amazonaws.com",
    /*
      …and the e-brochure viewer reads a PDF back with fetch + Range from
      whatever NEXT_PUBLIC_MEDIA_DOMAIN currently is. The two wildcards
      above only cover that by coincidence, because the media host happens
      to be a Spaces alias today. Point it at CloudFront — which section 6
      of docs/DEPLOYMENT.md offers as an option — and every brochure stops
      loading with nothing in any server log. img-src has spread mediaHosts
      for exactly this reason since it was written; connect-src did not, and
      that asymmetry was the bug.
    */
    ...mediaHosts.map((host) => `https://${host}`),
  ],

  /*
    Workers. Both were absent, which meant they fell back through child-src
    to default-src — 'self', so a same-origin worker happened to be allowed.
    Stated explicitly now because pdf.js is one wrong URL away from needing
    blob:: given a cross-origin workerSrc it wraps the worker in
    URL.createObjectURL itself (_createCDNWrapper in pdfjs-dist/build/pdf.mjs),
    and this policy must keep refusing that. scripts/copy-pdfjs-assets.mjs
    puts the worker under public/ so the same-origin branch is the only one
    ever taken.
  */
  "worker-src": ["'self'"],
  "child-src": ["'self'"],

  // reCAPTCHA renders its challenge in a frame; the contact page embeds a map.
  "frame-src": ["'self'", "https://www.google.com", "https://maps.google.com"],

  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  // Where our own forms may post. Everything goes to same-origin routes.
  "form-action": ["'self'"],
  /*
    'self', not 'none'.

    Two reasons. It matches the X-Frame-Options: SAMEORIGIN header set
    below — which has always allowed same-origin framing, so 'none' here
    made the two headers state different policies and left which one
    applied up to the browser. And the admin's 4-language content editor
    previews the real public page in an iframe beside the fields, which
    is same-origin.

    Third-party framing — the clickjacking case both headers exist for —
    is still refused.
  */
  "frame-ancestors": ["'self'"],
  "upgrade-insecure-requests": [],
};

function buildCsp() {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, values]) =>
      values.length > 0 ? `${directive} ${values.join(" ")}` : directive,
    )
    .join("; ");
}

const cspEnforced = process.env.CSP_ENFORCE === "true";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // frame-ancestors above supersedes this in modern browsers; kept for
  // older ones that never implemented it.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    /*
      geolocation=(self), not ().

      An empty allowlist does not merely gate the permission — it removes
      the capability, so `getCurrentPosition` invokes its error callback
      immediately and the browser never asks the visitor anything. The
      map's "How far is it from you?" button therefore reported
      "permission was declined" to everyone, with no prompt and nothing in
      the console to explain it. `self` restores the ordinary behaviour:
      our own pages may ask, the visitor decides, and a third-party frame
      still cannot.

      The coordinate is used in the browser to draw one line and is never
      sent to us — see components/MapCard.tsx.
    */
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: cspEnforced
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only",
    value: buildCsp(),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
    jsdom (via isomorphic-dompurify) is a CommonJS package that reads from
    the filesystem at require time — bundling it into the server output
    breaks it, so it is loaded from node_modules instead.

    Top-level since Next 15; `experimental.serverComponentsExternalPackages`
    is the Next 14 spelling and is now ignored with a warning.
  */
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],

  // Emits .next/standalone with only the files the server actually needs,
  // which is what keeps the Docker runtime stage small.
  output: "standalone",

  // gzip at the Node layer. Harmless when a CDN or nginx already compresses
  // — they negotiate once — and it is the difference between a 300kB and a
  // 90kB HTML response when nothing sits in front of the container.
  compress: true,

  // Removes `X-Powered-By: Next.js`. Version disclosure is free
  // reconnaissance and buys nothing.
  poweredByHeader: false,

  // A trailing-slash mismatch creates two indexable URLs per page.
  trailingSlash: false,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
      ...mediaHosts.map((hostname) => ({ protocol: "https", hostname })),
    ],
    formats: ["image/avif", "image/webp"],
    // Uploaded assets are immutable — the object key carries a UUID — so
    // the optimiser's cache can hold them for a day rather than 60s.
    minimumCacheTTL: 86400,
  },

  /**
   * The eight section editors and the FAQ list moved under the Pages hub —
   * see docs/ADMIN_IA_BLUEPRINT.md §3.1. These keep anybody's bookmarks and
   * any link pasted into a chat working.
   *
   * `:path*` is deliberately absent: every one of these was a single page
   * with no children, so matching the exact path is the whole job.
   *
   * No SEO consequence to weigh. Everything under /admin already answers
   * with `X-Robots-Tag: noindex, nofollow` (see headers() below), so these
   * paths were never in an index to move.
   */
  async redirects() {
    return [
      {
        source: "/:locale/admin/home-builder",
        destination: "/:locale/admin/pages/home/sections",
        permanent: true,
      },
      {
        source: "/:locale/admin/hero-banner",
        destination: "/:locale/admin/pages/home/hero",
        permanent: true,
      },
      {
        source: "/:locale/admin/home-gallery",
        destination: "/:locale/admin/pages/home/gallery",
        permanent: true,
      },
      {
        source: "/:locale/admin/cta",
        destination: "/:locale/admin/pages/home/cta",
        permanent: true,
      },
      {
        source: "/:locale/admin/corporate",
        destination: "/:locale/admin/pages/about/corporate",
        permanent: true,
      },
      {
        source: "/:locale/admin/why-us",
        destination: "/:locale/admin/pages/about/why-us",
        permanent: true,
      },
      {
        source: "/:locale/admin/mission",
        destination: "/:locale/admin/pages/about/mission",
        permanent: true,
      },
      {
        source: "/:locale/admin/awards",
        destination: "/:locale/admin/pages/about/awards",
        permanent: true,
      },
      {
        source: "/:locale/admin/milestones",
        destination: "/:locale/admin/pages/about/milestones",
        permanent: true,
      },
      {
        source: "/:locale/admin/faqs",
        destination: "/:locale/admin/pages/faq",
        permanent: true,
      },

      /* Translation status stopped being an SEO screen: it is a tab of the
         publishing hub, which is where the same person is already deciding
         what goes live. `alias` on the publishing nav item keeps the rail
         lit while a stale bookmark makes this hop. */
      {
        source: "/:locale/admin/seo/translations",
        destination: "/:locale/admin/publishing/translations",
        permanent: true,
      },

      /* The sitewide SEO defaults left the settings drawer for the SEO hub,
         where the rest of the SEO controls already were. */
      {
        source: "/:locale/admin/settings/seo",
        destination: "/:locale/admin/seo/defaults",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The admin is per-user and must never be held by a shared cache.
        source: "/:locale/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Same for the sign-in page and every API route.
        source: "/:locale/login",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // Hashed filenames — safe to cache permanently.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Sentry
//
// withSentryConfig wraps the already-wrapped config, so next-intl's
// plugin runs first and Sentry's webpack changes are applied on top.
//
// Source-map upload only happens when SENTRY_AUTH_TOKEN is present, which
// keeps `npm run build` on a laptop from failing on a missing credential.
// Without the maps, production stack traces point at minified bundles and
// are close to useless — set the token in CI.
// ─────────────────────────────────────────────────────────────────────────

// v10 moved the build-time export out of the runtime entry point; the
// old path still works but is removed in v11.
const { withSentryConfig } = require("@sentry/nextjs/config");

const config = withNextIntl(nextConfig);

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // The plugin is chatty; only speak up when something is wrong.
      silent: true,

      widenClientFileUpload: true,

      // Drops the SDK's own debug logging from the production bundle.
      // (`disableLogger: true` was the v8 spelling.)
      webpack: { treeshake: { removeDebugLogging: true } },

      // Strip the source maps from the deployed bundle after uploading
      // them. They are for Sentry, not for anyone reading the network tab.
      // (`hideSourceMaps` was the v8 spelling; removed in v9.)
      sourcemaps: { deleteSourcemapsAfterUpload: true },

      // Routes browser events through /monitoring on our own domain, so an
      // ad blocker cannot silently drop every client-side error report.
      tunnelRoute: "/monitoring",
    })
  : config;
