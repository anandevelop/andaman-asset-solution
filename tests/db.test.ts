/**
 * tests/db.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * safeQuery's failure classification.
 *
 * The stale-client case is the one that shipped a bug: adding a model to
 * schema.prisma without regenerating leaves `prisma.newModel` undefined, and
 * calling a method on it throws a TypeError before any query runs. That is
 * not a Prisma error, so it escaped safeQuery and turned every page reading
 * that model into a 500 — including pages whose whole design was to degrade
 * to an empty state.
 *
 * The matcher is narrow on purpose: a genuine TypeError in application code
 * must still surface rather than being silently swallowed as an empty result.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { isStaleClientError, isDatabaseOfflineError, safeQuery } from "@/lib/db";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isStaleClientError", () => {
  it.each([
    "findMany",
    "findUnique",
    "findFirst",
    "count",
    "aggregate",
    "groupBy",
    "create",
    "update",
    "upsert",
    "delete",
    "updateMany",
    "deleteMany",
    "createMany",
  ])("recognises an undefined model calling %s", (method) => {
    const error = new TypeError(
      `Cannot read properties of undefined (reading '${method}')`,
    );

    expect(isStaleClientError(error)).toBe(true);
  });

  it("matches the legacy V8 phrasing too", () => {
    // Older runtimes word it the other way round. Node 20 does not, but the
    // guard should not depend on a runtime's error text.
    const error = new TypeError("Cannot read property 'findMany' of undefined");

    expect(isStaleClientError(error)).toBe(true);
  });

  it("does not match the legacy phrasing for a non-Prisma property", () => {
    expect(
      isStaleClientError(new TypeError("Cannot read property 'name' of undefined")),
    ).toBe(false);
  });

  it("does not match an unrelated TypeError", () => {
    // A real bug in application code must still surface.
    expect(
      isStaleClientError(
        new TypeError("Cannot read properties of undefined (reading 'name')"),
      ),
    ).toBe(false);

    expect(isStaleClientError(new TypeError("x is not a function"))).toBe(false);
  });

  it("does not match a non-TypeError carrying the same text", () => {
    const error = new Error("Cannot read properties of undefined (reading 'findMany')");

    expect(isStaleClientError(error)).toBe(false);
  });

  it("is distinct from an offline error", () => {
    const error = new TypeError(
      "Cannot read properties of undefined (reading 'findMany')",
    );

    expect(isDatabaseOfflineError(error)).toBe(false);
    expect(isStaleClientError(error)).toBe(true);
  });
});

describe("safeQuery", () => {
  it("returns the result when the query succeeds", async () => {
    await expect(safeQuery("ok", async () => [1, 2, 3], [])).resolves.toEqual([1, 2, 3]);
  });

  it("returns the fallback for a stale client, and logs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeQuery(
      "test:stale",
      async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'findMany')");
      },
      ["fallback"],
    );

    expect(result).toEqual(["fallback"]);
    expect(logged).toHaveBeenCalled();
    // The message must name the command that fixes it.
    expect(logged.mock.calls[0][0]).toContain("prisma migrate dev");
  });

  it("rethrows an unrelated error", async () => {
    // Swallowing this would hide real bugs behind an empty page.
    await expect(
      safeQuery("test:bug", async () => {
        throw new TypeError("someValue.map is not a function");
      }, []),
    ).rejects.toThrow("someValue.map is not a function");
  });

  it("rethrows a plain Error", async () => {
    await expect(
      safeQuery("test:plain", async () => {
        throw new Error("constraint violation");
      }, []),
    ).rejects.toThrow("constraint violation");
  });
});
