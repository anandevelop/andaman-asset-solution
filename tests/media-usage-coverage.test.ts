import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  The media library refuses to delete a file that is in use, and "in use"
  means lib/media-usage.ts found it in one of its sources. Until 2026-10-22
  that list missed the project gallery, every progress photo, share images,
  the About hero, CTA backgrounds and the logo: the library called those
  files unused, and deleting one removed it from Spaces for good while a
  live page still showed it.

  This reads every URL-shaped string field in the schema and requires it to
  be either a source in lib/media-usage.ts or listed below with the reason it
  is not a library file. A new image field then fails here until somebody
  decides which it is.
*/

const NOT_LIBRARY_FILES: Record<string, string> = {
  "Project.googleMapsUrl": "a Google Maps link",
  "Project.virtualTourUrl": "an external 360 tour",
  "Project.canonicalUrl": "an SEO canonical, not a file",
  "NewsArticle.canonicalUrl": "an SEO canonical, not a file",
  "HeroStorySlide.ctaUrl": "a link target, not a file",
  "FloorPlan.blueprintImageUrl": "derived from imageUrl and regenerated on save",
};

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const usage = readFileSync(path.join(process.cwd(), "lib", "media-usage.ts"), "utf8");

function urlFields(): string[] {
  const fields: string[] = [];
  let model: string | null = null;
  for (const line of schema.split("\n")) {
    const opened = line.match(/^model (\w+) \{/);
    if (opened) {
      model = opened[1];
      continue;
    }
    if (line.startsWith("}")) model = null;
    if (!model) continue;
    const field = line.trim().match(/^(\w+)\s+String(\[\])?\??(\s|$)/);
    if (field && /(Url|gallery|images)$/.test(field[1])) fields.push(`${model}.${field[1]}`);
  }
  return fields;
}

/** "Model.field" for every column/arrayColumn source in lib/media-usage.ts. */
function coveredFields(): Set<string> {
  const covered = new Set<string>();
  for (const block of usage.split(/\b(?:arrayColumn|column)\(\{/).slice(1)) {
    const field = block.match(/field: "(\w+)"/)?.[1];
    const model = block.match(/prisma\.(\w+)\.findMany/)?.[1];
    if (field && model) covered.add(`${model.charAt(0).toUpperCase()}${model.slice(1)}.${field}`);
  }
  return covered;
}

describe("media usage coverage", () => {
  it("knows every image or file field in the schema", () => {
    const covered = coveredFields();
    const missing = urlFields().filter((field) => !covered.has(field) && !(field in NOT_LIBRARY_FILES));
    expect(missing).toEqual([]);
  });

  it("finds the fields this file exists for", () => {
    const covered = coveredFields();
    for (const field of [
      "Project.gallery",
      "ProjectProgress.images",
      "Project.ogImageUrl",
      "NewsArticle.ogImageUrl",
      "Event.ogImageUrl",
      "CompanyProfile.aboutHeroImageUrl",
      "SiteCtaBlock.backgroundImageUrl",
      "SiteSetting.value",
    ]) {
      expect(covered.has(field), field).toBe(true);
    }
  });

  it("looks inside article bodies too", () => {
    expect(usage).toMatch(/newsArticleTranslation\.findMany\(\{\s+where: \{ OR: urls\.map\(\(url\) => \(\{ content: \{ contains: url \} \}\)\) \}/);
  });
});
