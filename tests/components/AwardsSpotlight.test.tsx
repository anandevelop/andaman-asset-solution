/**
 * tests/components/AwardsSpotlight.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Covers the three behaviors the task brief calls out explicitly: every
 * award renders in the list, clicking a row changes the stage, and
 * aria-pressed always matches exactly one row.
 *
 * The stage's content swap runs on a real 380ms setTimeout (0ms only under
 * prefers-reduced-motion, which tests/setup.ts's matchMedia stub reports as
 * false) — waitFor polls for it with real timers rather than faking them,
 * since fake timers don't mix well with this component's mix of
 * setTimeout and requestAnimationFrame (the count-up, untested here since
 * it depends on Reveal's whileInView firing, which tests/setup.ts's
 * IntersectionObserver stub never does).
 */

// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import AwardsSpotlight, { type SpotlightAward } from "@/components/AwardsSpotlight";
import { render, screen, userEvent, waitFor, within } from "./render";

const AWARDS: SpotlightAward[] = [
  {
    id: "a1",
    title: "Best Breakthrough Developer",
    organization: "PropertyGuru Thailand",
    projectName: null,
    year: 2021,
    trophyImageUrl: null,
  },
  {
    id: "a2",
    title: "Best Development / Luxury Townhome",
    organization: "PropertyGuru Thailand",
    projectName: "The Residence",
    year: 2021,
    trophyImageUrl: null,
  },
  {
    id: "a3",
    title: "Best Development / New Launch Villa",
    organization: "PropertyGuru Thailand",
    projectName: "The Victory",
    year: 2020,
    trophyImageUrl: null,
  },
];

const labels = {
  eyebrow: "Corporate",
  title: "Awards",
  intro: "Andaman Asset Solution delivers end-to-end real estate excellence in Phuket.",
  awardsCountLabel: "Awards",
  yearLabel: "Year",
};

function setup() {
  return render(
    <AwardsSpotlight awards={AWARDS} awardsCount={AWARDS.length} latestYear={2021} labels={labels} />,
  );
}

describe("AwardsSpotlight", () => {
  it("renders every award in the list", () => {
    setup();
    const list = screen.getByRole("list");
    for (const award of AWARDS) {
      expect(within(list).getByText(award.title)).toBeInTheDocument();
    }
  });

  it("switches the stage caption to the clicked award", async () => {
    const user = userEvent.setup();
    setup();

    // The first award starts selected, so its title shows twice: once in
    // its own row, once as the stage caption.
    expect(screen.getAllByText(AWARDS[0].title)).toHaveLength(2);

    const rows = screen.getAllByRole("button");
    await user.click(rows[2]);

    await waitFor(() => {
      expect(screen.getAllByText(AWARDS[2].title)).toHaveLength(2);
    });
    // The first award's title now appears only in its own row — the stage
    // moved on to the third.
    expect(screen.getAllByText(AWARDS[0].title)).toHaveLength(1);
    expect(screen.getByText("The Victory · 2020")).toBeInTheDocument();
  });

  it("marks exactly the selected row as aria-pressed", async () => {
    const user = userEvent.setup();
    setup();

    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows[1]).toHaveAttribute("aria-pressed", "false");
    expect(rows[2]).toHaveAttribute("aria-pressed", "false");

    await user.click(rows[1]);

    expect(rows[0]).toHaveAttribute("aria-pressed", "false");
    expect(rows[1]).toHaveAttribute("aria-pressed", "true");
    expect(rows[2]).toHaveAttribute("aria-pressed", "false");
  });
});
