/**
 * config/legacy-redirects.js
 * ─────────────────────────────────────────────────────────────────────────
 * Where the old WordPress site's URLs go once andamanassetsolution.com
 * points at this app. Read by next.config.js redirects(), so each one is a
 * single permanent redirect, answered before the proxy and before
 * next-intl's locale negotiation. Through the proxy, the same URL would
 * get a temporary 307 to whichever locale the crawler's Accept-Language
 * picked (Googlebot gets /en), and only then reach the admin's redirect
 * table.
 *
 * WHERE THE LIST CAME FROM
 *
 * The old sitemaps list about 38 URLs. Search Console lists 272 paths
 * with impressions over the last sixteen months, so this follows Search
 * Console. Every old URL is Thai, because the old site was Thai-only, so
 * every destination is /th.
 *
 * Business pages map to their counterparts. The old project URLs
 * (/the-residence-prime/, /the-trinity-village/, …) carried a few
 * hundred clicks between them.
 *
 * The lifestyle articles (/blog/, /luxury-villa-phuket/, /smart-home/,
 * /house-garden/) brought about 7,000 of the old site's ~9,500 clicks,
 * most of it one article on bedroom plants. None of them exist here. They
 * go to /th/news, which keeps a visitor on the site, but Google treats a
 * redirect to an unrelated page as a soft 404 and will drop them. Keeping
 * that traffic means re-publishing the articles that earned it, as news
 * posts, and pointing their old URL at the new slug in the admin's
 * redirect table.
 *
 * /wp-content/uploads/* is left to 404 on purpose. A removed image is
 * gone, and redirecting it to a page would be a soft 404 for image search.
 *
 * Old URLs ended in "/". Next strips that with a 308 first (trailingSlash:
 * false), so a source here is written without it.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** [source, destination]. Destinations are public routes under /th. */
const MAP = [
  // Projects, under their old names and their old project-type URLs.
  ["/the-residence-prime", "/th/projects/residence-prime"],
  ["/the-residence", "/th/projects/residence-prime"],
  ["/the-residence/:path*", "/th/projects/residence-prime"],
  ["/the-trinity-village", "/th/projects/trinity-village"],
  ["/the-trinity", "/th/projects/trinity-village"],
  ["/the-trinity/:path*", "/th/projects/trinity-village"],
  ["/the-victory", "/th/projects/victory"],
  ["/the-victory-form", "/th/projects/victory"],
  ["/projects", "/th/projects"],
  ["/projects/:slug", "/th/projects/:slug"],
  ["/project-gallery", "/th/projects"],
  ["/concept-design", "/th/projects"],
  ["/construction-update", "/th/progress"],
  ["/construction-update/:path*", "/th/progress"],

  // Company pages.
  ["/contact", "/th/contact"],
  ["/contact-agency", "/th/agent/register"],
  ["/our-corporate", "/th/about"],
  ["/our-space", "/th/about"],
  ["/services", "/th/about"],
  ["/services/:path*", "/th/about"],
  ["/careers", "/th/about"],
  ["/careers/:path*", "/th/about"],
  ["/our-achievements", "/th/achievements"],
  ["/our-achievements-2", "/th/achievements"],
  ["/4-winning-of-dot-property-thailand-award-2021", "/th/achievements"],
  ["/event", "/th/events"],
  ["/q-a", "/th"],
  ["/privacy", "/th/privacy-policy"],
  ["/sample-page", "/th"],
  ["/author/:path*", "/th"],

  // Articles, archives and feeds. See the header on why these are /th/news.
  ["/blog", "/th/news"],
  ["/blog/:path*", "/th/news"],
  ["/luxury-villa-phuket", "/th/news"],
  ["/luxury-villa-phuket/:path*", "/th/news"],
  ["/luxury-villas/:path*", "/th/news"],
  ["/smart-home", "/th/news"],
  ["/smart-home/:path*", "/th/news"],
  ["/house-garden/:path*", "/th/news"],
  ["/andaman-news", "/th/news"],
  ["/andaman-news/:path*", "/th/news"],
  ["/csr", "/th/news"],
  ["/csr/:path*", "/th/news"],
  ["/category/:path*", "/th/news"],
  ["/tag/:path*", "/th/news"],
  ["/feed", "/th/news"],
  ["/comments/feed", "/th/news"],
  ["/hello-world", "/th/news"],
  ["/andaman-joins-the-2021-annual-general-meeting-of-the-phuket-real-estate-association-p-rea", "/th/news"],
  ["/the-collective-spirit-of-us-we-can-get-through-this-covid-19", "/th/news"],
  ["/wishes-to-assist-wat-thepkasattri-school-bandon-by-donating-an-electrical-fan", "/th/news"],
  ["/well-kind-to-each-other", "/th/news"],
  ["/the-following-rules-will-be-in-effect-from-1-may-2022", "/th/news"],
  ["/thailand-visa-extension", "/th/news"],
  ["/long-term-resident-visa-thailand", "/th/news"],
  ["/thailand-fully-reopens-from-1-october", "/th/news"],
  ["/csr-the-surin-beach-andman-asset-solution", "/th/news"],
  ["/csr-the-bangtao-beach-andman-asset-solution", "/th/news"],
  ["/csr-the-layan-beach-andman-asset-solution", "/th/news"],
  ["/csr-the-pasak-soi8-andman-asset-solution", "/th/news"],
  ["/csr-the-bangjo-andman-asset-solution", "/th/news"],
  ["/corporate-social-responsibility-csr-cleaning-up-at-pasak-soi-8", "/th/news"],
];

const legacyRedirects = MAP.map(([source, destination]) => ({ source, destination, permanent: true }));

module.exports = { legacyRedirects };
