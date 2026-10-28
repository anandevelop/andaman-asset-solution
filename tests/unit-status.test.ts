/**
 * tests/unit-status.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * TRANSFERRED was in the Prisma enum but not in UNIT_STATUSES, so the unit
 * form could not offer it, a save carrying it failed validation, and the
 * units tab counted a handed-over plot as plain "sold".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { UnitStatus } from "@prisma/client";
import { countUnits, type UnitRow } from "@/lib/admin/project-units";
import { UNIT_STATUSES, unitStatusPatchSchema } from "@/lib/validations";

describe("unit statuses", () => {
  it("validates every status the database can hold", () => {
    expect([...UNIT_STATUSES].sort()).toEqual(Object.values(UnitStatus).sort());
    expect(unitStatusPatchSchema.safeParse({ status: "TRANSFERRED" }).success).toBe(true);
  });

  it("counts a handed-over plot apart from sold", () => {
    const unit = (status: UnitStatus, releasedForSale = true) => ({ status, releasedForSale }) as UnitRow;

    expect(
      countUnits([
        unit("AVAILABLE"),
        unit("SOLD"),
        unit("TRANSFERRED"),
        unit("TRANSFERRED"),
        unit("AVAILABLE", false),
      ]),
    ).toEqual({ available: 1, reserved: 0, sold: 1, transferred: 2, unreleased: 1 });
  });
});
