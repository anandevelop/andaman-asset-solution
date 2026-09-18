/**
 * tests/news-workflow.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * mergeTransitionOutcome() — the pure decision behind
 * updateArticleAndTransition(), the editor's own top-right workflow
 * button: a save that succeeds but whose extra transition
 * (submitForReview/approveAndPublish) fails must still report the save,
 * not silently swallow the transition failure or roll the save back.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { mergeTransitionOutcome } from "@/app/[locale]/admin/(content)/news/actions";

describe("mergeTransitionOutcome", () => {
  it("returns the save result unchanged when no transition was requested", async () => {
    const saved = { ok: true, message: "SAVED" };
    expect(await mergeTransitionOutcome(saved, null)).toEqual(saved);
  });

  it("returns the save result unchanged when the transition also succeeded", async () => {
    const saved = { ok: true, message: "SAVED" };
    expect(await mergeTransitionOutcome(saved, { ok: true })).toEqual(saved);
  });

  it("flags a transition failure without discarding the successful save", async () => {
    const saved = { ok: true, message: "SAVED" };
    const result = await mergeTransitionOutcome(saved, { ok: false, error: "WRONG_STATE" });
    expect(result.ok).toBe(true);
    expect(result.message).toBe("TRANSITION_FAILED:WRONG_STATE");
  });

  it("never attempts to merge a transition outcome onto a failed save", async () => {
    const failed = { ok: false, message: "SAVE_FAILED" };
    // Even a "transition succeeded" outcome must not overwrite a failed save.
    expect(await mergeTransitionOutcome(failed, { ok: true })).toEqual(failed);
    expect(await mergeTransitionOutcome(failed, { ok: false, error: "WRONG_STATE" })).toEqual(failed);
  });
});
