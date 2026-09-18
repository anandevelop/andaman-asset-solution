/**
 * tests/api/validate-email.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The MX-lookup half of the inline email check — getEmailVerdict(), which
 * app/api/validate-email/route.ts's POST handler is a thin wrapper around.
 * node:dns/promises is mocked here so this suite runs with no real DNS
 * traffic and no timing dependency on the route's actual 2.5s cutoff; see
 * tests/lib/email-quality.test.ts for the pure, unmocked half.
 *
 * Node's resolveMx *rejects* rather than resolving an empty array for a
 * domain with no MX record — the mocks below reproduce that exactly
 * (ENOTFOUND/ENODATA), since getEmailVerdict's whole "is this a real
 * timeout or a real answer" distinction turns on the error's `.code`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMx } = vi.hoisted(() => ({ resolveMx: vi.fn() }));

vi.mock("node:dns/promises", () => ({ resolveMx }));

import { getEmailVerdict } from "@/app/api/validate-email/route";

function noMxError(code: "ENOTFOUND" | "ENODATA" = "ENOTFOUND") {
  const error = new Error(`queryMx ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

beforeEach(() => {
  resolveMx.mockReset();
});

describe("getEmailVerdict", () => {
  it("resolves \"deliverable\" when the domain has an MX record", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx.example-mail.test", priority: 10 }]);

    expect(await getEmailVerdict("somchai@example-mail.test")).toEqual({ status: "deliverable" });
  });

  it("never suggests a correction for a domain that resolves", async () => {
    // "gmial-hosting.test" reads like a typo of gmail.com, but it has its
    // own MX record — telling its owner they misspelled Gmail would be
    // wrong, not helpful. See suggestEmailCorrection's own tests for the
    // string-distance half of this rule; this is the ordering half.
    resolveMx.mockResolvedValue([{ exchange: "mx.gmial-hosting.test", priority: 10 }]);

    expect(await getEmailVerdict("somchai@gmial-hosting.test")).toEqual({ status: "deliverable" });
  });

  it("checks the disposable list before ever calling resolveMx", async () => {
    const result = await getEmailVerdict("bot@mailinator.com");

    expect(result).toEqual({ status: "disposable" });
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it("suggests a correction when there is no MX and a common domain is close", async () => {
    resolveMx.mockRejectedValue(noMxError());

    expect(await getEmailVerdict("somchai.r@gmial.com")).toEqual({
      status: "typo",
      suggestion: "somchai.r@gmail.com",
    });
  });

  it("falls back to \"no_mx\" when there is no MX and no domain is close enough", async () => {
    resolveMx.mockRejectedValue(noMxError());

    expect(await getEmailVerdict("x@this-is-a-real-but-unreachable-domain.test")).toEqual({
      status: "no_mx",
    });
  });

  it("treats ENODATA the same as ENOTFOUND", async () => {
    resolveMx.mockRejectedValue(noMxError("ENODATA"));

    expect(await getEmailVerdict("x@no-mx-published.test")).toEqual({ status: "no_mx" });
  });

  it("resolves \"unknown\" on a timeout or any other resolver failure", async () => {
    // Exercises exactly the branch the route's own 2.5s race falls into
    // on a real timeout — see this file's header for why the test mocks
    // the failure rather than the clock.
    resolveMx.mockRejectedValue(new Error("validate-email: MX lookup timed out"));

    expect(await getEmailVerdict("x@slow-dns.test")).toEqual({ status: "unknown" });
  });

  it("resolves \"unknown\" for a malformed address with no domain at all", async () => {
    expect(await getEmailVerdict("not-an-email")).toEqual({ status: "unknown" });
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it("caches a definite MX answer so the same domain is not re-resolved", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx.cached-domain.test", priority: 10 }]);

    await getEmailVerdict("a@cached-domain.test");
    await getEmailVerdict("b@cached-domain.test");

    expect(resolveMx).toHaveBeenCalledTimes(1);
  });

  it("does not cache a timeout, so the same domain is retried next time", async () => {
    resolveMx.mockRejectedValue(new Error("validate-email: MX lookup timed out"));

    await getEmailVerdict("a@retry-domain.test");
    await getEmailVerdict("b@retry-domain.test");

    expect(resolveMx).toHaveBeenCalledTimes(2);
  });
});
