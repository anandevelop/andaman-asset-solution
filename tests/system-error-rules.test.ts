import { describe, expect, it } from "vitest";
import {
  MAX_ALERTS_PER_HOUR,
  REALERT_AFTER_MS,
  factsOf,
  fingerprintOf,
  isIgnorable,
  placeOf,
  shouldAlert,
} from "@/lib/system-error-rules";

describe("what is not worth reporting", () => {
  it.each(["NEXT_REDIRECT;replace;/th", "NEXT_NOT_FOUND", "Failed to fetch", "ResizeObserver loop limit exceeded", "UNAUTHORISED"])(
    "ignores %s",
    (message) => expect(isIgnorable(factsOf(new Error(message)))).toBe(true),
  );

  it("ignores a redirect that is only visible in the digest", () => {
    const error = Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;push;/en;307" });
    expect(isIgnorable(factsOf(error))).toBe(true);
  });

  it("ignores an aborted request by name", () => {
    const error = new Error("gone");
    error.name = "AbortError";
    expect(isIgnorable(factsOf(error))).toBe(true);
  });

  it("keeps a real failure", () => {
    expect(isIgnorable(factsOf(new TypeError("Cannot read properties of undefined (reading 'id')")))).toBe(false);
    expect(isIgnorable(factsOf(new Error("Can't reach database server")))).toBe(false);
  });
});

describe("factsOf", () => {
  it("reads anything that was thrown", () => {
    expect(factsOf("boom")).toEqual({ name: "Error", message: "boom" });
    expect(factsOf(null).message).toBe("unknown error");
    expect(factsOf(new RangeError("x".repeat(900))).message).toHaveLength(600);
  });
});

describe("placeOf", () => {
  it("drops the locale and the query string", () => {
    expect(placeOf("/th/projects/the-victory?utm=1")).toBe("/projects/the-victory");
    expect(placeOf("/en")).toBe("/");
    expect(placeOf("/api/leads")).toBe("/api/leads");
    expect(placeOf(undefined)).toBe("/");
  });
});

describe("fingerprintOf", () => {
  const print = (message: string, place = "/admin/leads") => fingerprintOf("server", factsOf(new Error(message)), place);

  it("is one failure whichever record it happened on", () => {
    expect(print("Lead ckv9x2k3t0000abcd1234efgh not found")).toBe(print("Lead ckw1a7b8c0001zzzz9876yyyy not found"));
    expect(print("Timed out after 3000ms")).toBe(print("Timed out after 5012ms"));
    expect(print('Unknown field "price"')).toBe(print('Unknown field "area"'));
  });

  it("tells different failures, places and sides apart", () => {
    expect(print("a")).not.toBe(print("b"));
    expect(print("a", "/admin/leads")).not.toBe(print("a", "/admin/units"));
    expect(fingerprintOf("client", factsOf(new Error("a")), "/")).not.toBe(fingerprintOf("server", factsOf(new Error("a")), "/"));
  });
});

describe("shouldAlert", () => {
  const now = new Date("2026-11-13T10:00:00Z");

  it("tells the team the first time", () => {
    expect(shouldAlert({ lastAlertAt: null, alertsThisHour: 0, now })).toBe(true);
  });

  it("stays quiet about the same failure for six hours", () => {
    const recent = new Date(now.getTime() - REALERT_AFTER_MS + 60_000);
    const old = new Date(now.getTime() - REALERT_AFTER_MS);
    expect(shouldAlert({ lastAlertAt: recent, alertsThisHour: 0, now })).toBe(false);
    expect(shouldAlert({ lastAlertAt: old, alertsThisHour: 0, now })).toBe(true);
  });

  it("stops at the hourly cap, even for a new failure", () => {
    expect(shouldAlert({ lastAlertAt: null, alertsThisHour: MAX_ALERTS_PER_HOUR, now })).toBe(false);
  });
});
