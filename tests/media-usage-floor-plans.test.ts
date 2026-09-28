/**
 * tests/media-usage-floor-plans.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The media library's "where is this image used?" panel, for the columns
 * the unit-types workspace introduced.
 *
 * Structural, reading lib/media-usage.ts's source — the same approach
 * tests/admin/project-workspace.test.ts already takes for the progress
 * href, and for the same reason: the registry is a module-private array of
 * closures, and exercising it properly would mean a database. What can go
 * wrong without one is a column being forgotten, or its link pointing at a
 * screen that no longer edits that field, and both are visible in the file.
 *
 * Forgetting a column is not cosmetic. The panel is what stops somebody
 * deleting a photo that a room label still points at, and a field missing
 * from the registry reports "not used anywhere" — which is a delete button
 * offered for an image that is on the public site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "lib", "media-usage.ts"), "utf8");

describe("the floor-plan columns", () => {
  it("tracks the furnished plan", () => {
    expect(source).toContain('field: "furnishedImageUrl"');
  });

  it("tracks a room's photo", () => {
    expect(source).toContain('kind: "floorPlanRoom"');
    expect(source).toContain('note: "roomPhoto"');
    expect(source).toContain("prisma.floorPlanRoom.findMany");
  });

  /*
    The blueprint is generated from the line drawing at a predictable key
    and regenerated on every change to it. Listing it would report one
    drawing as used twice and offer a delete for a file the next save
    recreates.
  */
  it("deliberately does not track the derived blueprint", () => {
    expect(source).not.toContain('field: "blueprintImageUrl"');
  });

  it("explains that absence, so it is not restored as an oversight", () => {
    expect(source).toContain("blueprintImageUrl is deliberately absent");
  });
});

describe("where the panel links to", () => {
  it("sends floor plans to the screen that edits them", () => {
    // They moved off the project's own edit form when the workspace landed;
    // the old link led to a page with no floor on it.
    expect(source).toContain("${f.unitType.projectId}/unit-types");
    expect(source).not.toContain("${f.unitType.projectId}/edit");
  });

  it("sends a room photo to the same screen", () => {
    expect(source).toContain("${room.floorPlan.unitType.projectId}/unit-types");
  });
});

describe("the registry as a whole", () => {
  it("finds the columns it is supposed to be checking", () => {
    // A rename that broke every assertion above into a no-op would
    // otherwise leave this file green and checking nothing.
    expect(source.match(/kind: "/g)?.length ?? 0).toBeGreaterThan(10);
    expect(source).toContain('kind: "floorPlan"');
  });
});
