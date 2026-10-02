/**
 * tests/admin/complete-order.test.ts — the home drag list's save guard.
 */

import { describe, expect, it } from "vitest";
import { isCompleteOrder } from "@/lib/admin/complete-order";

describe("isCompleteOrder", () => {
  const known = ["a", "b", "c"];

  it("accepts a reordering of every id", () => {
    expect(isCompleteOrder(["c", "a", "b"], known)).toBe(true);
  });

  it("refuses a list missing a row, or carrying an unknown one", () => {
    expect(isCompleteOrder(["a", "b"], known)).toBe(false);
    expect(isCompleteOrder(["a", "b", "x"], known)).toBe(false);
  });

  it("refuses a duplicated id even when the count matches", () => {
    expect(isCompleteOrder(["a", "a", "b"], known)).toBe(false);
  });
});
