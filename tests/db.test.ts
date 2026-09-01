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
import { Prisma } from "@prisma/client";
import {
  DatabaseUnavailableError,
  isDatabaseOffline,
  isStaleClientError,
  isDatabaseOfflineError,
  safeQuery,
} from "@/lib/db";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A Prisma error carrying a specific connection-layer code. */
const connectionError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`simulated ${code}`, {
    code,
    clientVersion: "5.20.0",
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

/*
  The offline path is the whole point of this module — a marketing site that
  answers 500 because Postgres blinked has failed at the only job the
  degradation was written for — and it was the half with no test.
*/
describe("isDatabaseOfflineError", () => {
  it.each([
    ["P1000", "authentication failed"],
    ["P1001", "cannot reach the server"],
    ["P1002", "connection timed out"],
    ["P1003", "database does not exist"],
    ["P1008", "operation timed out"],
    ["P1010", "access denied"],
    ["P1017", "server closed the connection"],
    ["P2021", "table missing — migrations never ran"],
    ["P2022", "column missing — migrations never ran"],
  ])("treats %s (%s) as offline", (code) => {
    expect(isDatabaseOfflineError(connectionError(code))).toBe(true);
  });

  it("leaves a constraint violation to the caller", () => {
    // P2002 is a unique-key clash: the database answered, and answered
    // correctly. Swallowing it would turn a bug into an empty page.
    expect(isDatabaseOfflineError(connectionError("P2002"))).toBe(false);
  });

  it("counts an initialisation failure as offline", () => {
    // Thrown before any request code exists: bad DATABASE_URL, engine that
    // will not start, no binary for the platform.
    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      "5.20.0",
    );

    expect(isDatabaseOfflineError(error)).toBe(true);
  });

  it("is not fooled by a plain object wearing the same code", () => {
    expect(isDatabaseOfflineError({ code: "P1001" })).toBe(false);
    expect(isDatabaseOfflineError(new Error("P1001"))).toBe(false);
  });
});

describe("safeQuery when the database is unreachable", () => {
  it("returns the fallback and names the code in the log", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeQuery(
      "test:offline",
      async () => {
        throw connectionError("P1001");
      },
      ["empty"],
    );

    expect(result).toEqual(["empty"]);

    // The operator's log line has to carry both the code and the label, or
    // it says "something is down" and nothing else.
    const message = logged.mock.calls.at(-1)?.[0] as string;
    expect(message).toContain("DATABASE UNREACHABLE");
    expect(message).toContain("[P1001]");
    expect(message).toContain("test:offline");
    expect(message).toContain("npm run db:up");
  });

  it("reports offline afterwards, and online again after a good read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await safeQuery("test:flip", async () => {
      throw connectionError("P1001");
    }, null);

    expect(isDatabaseOffline()).toBe(true);

    // A page that reads twice must not keep reporting a stale outage after
    // the second read succeeds.
    await safeQuery("test:flip", async () => "back", null);

    expect(isDatabaseOffline()).toBe(false);
  });

  it("logs once for a page that runs six failing queries", async () => {
    // Far enough ahead that whatever the earlier tests left in the throttle
    // is outside the window, whichever order they ran in.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < 6; i++) {
      await safeQuery("test:throttle", async () => {
        throw connectionError("P1001");
      }, null);
    }

    expect(logged).toHaveBeenCalledTimes(1);

    // Still inside the ten-second window.
    vi.setSystemTime(new Date("2030-01-01T00:00:05Z"));
    await safeQuery("test:throttle", async () => {
      throw connectionError("P1001");
    }, null);
    expect(logged).toHaveBeenCalledTimes(1);

    // Past it: an outage that is still going deserves saying again.
    vi.setSystemTime(new Date("2030-01-01T00:00:20Z"));
    await safeQuery("test:throttle", async () => {
      throw connectionError("P1001");
    }, null);
    expect(logged).toHaveBeenCalledTimes(2);
  });
});

describe("DatabaseUnavailableError", () => {
  it("carries the label and a name callers can match on", () => {
    const error = new DatabaseUnavailableError("project.findUnique");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DatabaseUnavailableError");
    expect(error.message).toContain("project.findUnique");
  });
});
