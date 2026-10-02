/**
 * tests/admin/leads-view.test.ts — which view /admin/leads opens in.
 */

import { describe, expect, it } from "vitest";
import { resolveLeadsView } from "@/lib/admin/leads-view";

describe("resolveLeadsView", () => {
  it("defaults to the table", () => {
    expect(resolveLeadsView(undefined, undefined)).toBe("table");
  });

  it("reopens the last choice when the URL names none", () => {
    expect(resolveLeadsView(undefined, "board")).toBe("board");
  });

  it("lets a link win over the remembered choice", () => {
    expect(resolveLeadsView("table", "board")).toBe("table");
  });

  it("ignores values it does not know", () => {
    expect(resolveLeadsView("kanban", "grid")).toBe("table");
  });
});
