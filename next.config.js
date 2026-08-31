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
 * serve the same objects; dropping the origin here would break those
 * images exactly the way dropping the Supabase hosts below would.
 */
const mediaOriginDomain =
  mediaDomain && mediaDomain.includes(".cdn.digitaloceanspaces.com")
    ? mediaDomain.replace(".cdn.digitaloceanspaces.com", ".digitaloceanspaces.com")
    : null;

/** Every host that may serve an uploaded image, newest alias first. */
const mediaHosts = [mediaDomain, mediaOriginDomain].filter(Boolean);

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
    // next/script and the framework's own hydration payload.
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
  ],

  // reCAPTCHA renders its challenge in a frame; the contact page embeds a map.
  "frame-src": ["'self'", "https://www.google.com", "https://maps.google.com"],

  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  // Where our own forms may post. Everything goes to same-origin routes.
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
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
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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

  // ✅ เปลี่ยนมาใช้ experimental.serverComponentsExternalPackages แทน
  experimental: {
    serverComponentsExternalPackages: ["isomorphic-dompurify", "jsdom"],
  },

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
      /*
        Supabase was the previous media host. Every image uploaded before
        the move to Spaces is still stored in the database as a supabase.co
        URL, so these stay until those rows are rewritten — dropping them
        turns years of existing project galleries into broken images.
      */
      { protocol: "https", hostname: "nwgjexifvlryisfxhhxa.supabase.co" },
      { protocol: "https", hostname: "nwgjexifvlryisfxhhxa.storage.supabase.co" },
      ...mediaHosts.map((hostname) => ({ protocol: "https", hostname })),
    ],
    formats: ["image/avif", "image/webp"],
    // Uploaded assets are immutable — the object key carries a UUID — so
    // the optimiser's cache can hold them for a day rather than 60s.
    minimumCacheTTL: 86400,
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

const { withSentryConfig } = require("@sentry/nextjs");

const config = withNextIntl(nextConfig);

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // The plugin is chatty; only speak up when something is wrong.
      silent: true,

      // Strip the source maps from the deployed bundle after uploading
      // them. They are for Sentry, not for anyone reading the network tab.
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,

      // Routes browser events through /monitoring on our own domain, so an
      // ad blocker cannot silently drop every client-side error report.
      tunnelRoute: "/monitoring",
    })
  : config;
