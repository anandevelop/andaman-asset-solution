/**
 * tests/line.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * LINE webhook signature verification.
 *
 * This function is the only thing standing between the webhook and anyone
 * on the internet posting fabricated events. Two failure modes are tested
 * explicitly because both have shipped in real codebases: a length mismatch
 * throwing out of timingSafeEqual instead of returning false, and the
 * signature being computed over re-serialised JSON rather than raw bytes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notifyNewLead, verifyLineSignature } from "@/lib/line";

const SECRET = "test_channel_secret_abc123";

const BODY = JSON.stringify({
  destination: "U0000",
  events: [{ type: "message", source: { type: "user", userId: "U123" } }],
});

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifyLineSignature", () => {
  const original = process.env.LINE_CHANNEL_SECRET;

  beforeEach(() => {
    process.env.LINE_CHANNEL_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LINE_CHANNEL_SECRET;
    else process.env.LINE_CHANNEL_SECRET = original;
  });

  it("accepts a correctly signed body", () => {
    expect(verifyLineSignature(BODY, sign(BODY))).toBe(true);
  });

  it("rejects a body modified after signing", () => {
    expect(verifyLineSignature(`${BODY} `, sign(BODY))).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyLineSignature(BODY, sign(BODY, "wrong-secret"))).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyLineSignature(BODY, null)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyLineSignature(BODY, "")).toBe(false);
  });

  it("returns false rather than throwing on a truncated signature", () => {
    // timingSafeEqual throws on a length mismatch — the guard must catch it
    // before the comparison, or a malformed header becomes a 500.
    expect(() => verifyLineSignature(BODY, sign(BODY).slice(0, -4))).not.toThrow();
    expect(verifyLineSignature(BODY, sign(BODY).slice(0, -4))).toBe(false);
  });

  it("returns false rather than throwing on an over-long signature", () => {
    expect(() => verifyLineSignature(BODY, `${sign(BODY)}AAAA`)).not.toThrow();
    expect(verifyLineSignature(BODY, `${sign(BODY)}AAAA`)).toBe(false);
  });

  it("rejects everything when the secret is unset", () => {
    delete process.env.LINE_CHANNEL_SECRET;

    expect(verifyLineSignature(BODY, sign(BODY))).toBe(false);
  });

  it("fails if the body was parsed and re-serialised", () => {
    // Documents why the route reads request.text() and not request.json():
    // round-tripping through JSON.parse changes the bytes.
    const reSerialised = JSON.stringify(JSON.parse(BODY), null, 2);

    expect(verifyLineSignature(reSerialised, sign(BODY))).toBe(false);
  });

  it("handles a body containing non-ASCII characters", () => {
    // Thai copy in an event payload must hash over UTF-8 bytes consistently.
    const thai = JSON.stringify({ events: [{ text: "สวัสดีครับ 🙏" }] });

    expect(verifyLineSignature(thai, sign(thai))).toBe(true);
  });

  it("rejects an empty body signed for different content", () => {
    expect(verifyLineSignature("", sign(BODY))).toBe(false);
  });
});

describe("notifyNewLead", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let bodies: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    bodies = [];
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
    process.env.LINE_NOTIFY_TO = "C0123456789abcdef";
    process.env.NEXT_PUBLIC_SITE_URL = "https://andamanassetsolution.com";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const lead = {
    id: "cmvkbdpdz01sp07nqmq8wtgf1",
    name: "Isla Chen",
    email: "isla@example.com",
    phone: "+85212345678",
    message: "Interested in a viewing",
    projectName: "trinity-village",
    source: "PROJECT_PAGE",
  };

  it("pushes one card to a group ID, never multicast", async () => {
    await notifyNewLead(lead);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].to).toBe("C0123456789abcdef");
  });

  it("links the card to the lead in the Thai back office", async () => {
    await notifyNewLead(lead);
    expect(JSON.stringify(bodies[0])).toContain(
      "https://andamanassetsolution.com/th/admin/leads?lead=cmvkbdpdz01sp07nqmq8wtgf1",
    );
  });

  it("drops the back-office button when the site URL is not https", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await notifyNewLead(lead);
    expect(JSON.stringify(bodies[0])).not.toContain("เปิดในหลังบ้าน");
    expect(JSON.stringify(bodies[0])).toContain("tel:+85212345678");
  });

  it("does nothing when LINE is not configured", async () => {
    delete process.env.LINE_NOTIFY_TO;
    await notifyNewLead(lead);
    expect(bodies).toHaveLength(0);
  });
});
