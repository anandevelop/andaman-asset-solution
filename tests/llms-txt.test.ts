/**
 * tests/llms-txt.test.ts — the site map for AI assistants.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects", () => ({
  getPublishedProjects: async () => [
    {
      slug: "victory",
      name: "The Victory",
      tagline: "Pool villas near the Heroines Monument",
      location: "Thepkasattri, Phuket",
      totalUnits: 45,
      bedroomsMin: 3,
      bedroomsMax: 5,
      status: "UNDER_CONSTRUCTION",
    },
  ],
}));
vi.mock("@/lib/db", () => ({ safeQuery: async (_: string, run: () => Promise<unknown>) => run() }));

import { GET } from "@/app/llms.txt/route";

describe("/llms.txt", () => {
  it("lists each development with a link and its facts", async () => {
    const response = await GET();
    const text = await response.text();
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(text).toMatch(/^# Andaman Asset Solution/);
    expect(text).toContain(
      "- [The Victory](https://andamanassetsolution.com/en/projects/victory): Pool villas near the Heroines Monument — Thepkasattri, Phuket, 45 villas, 3–5 bedrooms, under construction",
    );
    expect(text).not.toMatch(/luxury/i);
  });
});
