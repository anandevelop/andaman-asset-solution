/**
 * GET /llms.txt — a plain-language map of the site for AI assistants
 * (ChatGPT, Claude, Perplexity, Gemini) that read it, per llmstxt.org:
 * who the company is, its developments with one line each, and the pages
 * worth reading. Shown on /admin/seo/ai-search.
 *
 * Rendered per request: built at deploy time it would be made with no
 * database and list no projects (the same trap app/sitemap.ts fell into).
 * Search engines ignore it; it costs one query.
 */

import { getPublishedProjects } from "@/lib/projects";
import { siteConfig } from "@/config/site";
import { safeQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  UPCOMING: "upcoming",
  UNDER_CONSTRUCTION: "under construction",
  READY_TO_MOVE_IN: "ready to move in",
  SOLD_OUT: "sold out",
};

export async function GET() {
  const projects = await safeQuery("llms:projects", () => getPublishedProjects("en"), []);
  const url = siteConfig.url;

  const lines = [
    `# ${siteConfig.name}`,
    "",
    "> Developer of pool villas in Phuket, Thailand (Cherngtalay / Laguna and Thalang). The site is published in English, Thai, Chinese and Russian.",
    "",
    "## Developments",
    ...projects.map((project) => {
      const facts = [
        project.location,
        project.totalUnits ? `${project.totalUnits} villas` : null,
        project.bedroomsMin
          ? project.bedroomsMin === project.bedroomsMax
            ? `${project.bedroomsMin} bedrooms`
            : `${project.bedroomsMin}–${project.bedroomsMax} bedrooms`
          : null,
        STATUS[project.status] ?? null,
      ].filter(Boolean);
      return `- [${project.name}](${url}/en/projects/${project.slug}): ${[project.tagline, facts.join(", ")].filter(Boolean).join(" — ")}`;
    }),
    "",
    "## Pages",
    `- [All projects](${url}/en/projects): every development with status, size and location`,
    `- [Construction progress](${url}/en/progress): monthly photos and videos from each site`,
    `- [E-brochures](${url}/en/e-brochure): downloadable brochures per project`,
    `- [News](${url}/en/news): company and market updates`,
    `- [About](${url}/en/about): the company, its history and awards`,
    `- [Contact](${url}/en/contact): sales office, phone, LINE and WhatsApp`,
    "",
    "## Other languages",
    `- Thai: ${url}/th · Chinese: ${url}/zh · Russian: ${url}/ru`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
