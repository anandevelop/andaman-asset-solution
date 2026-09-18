/**
 * tests/links.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * containsLink() gates the Lead form's message field on both sides of the
 * trust boundary (LeadForm.tsx's resolver, leadInquiryServerSchema) — see
 * lib/links.ts's own header for the full reasoning. What matters here is
 * not just that it catches spam, but that it does not also catch the
 * ordinary contact details a real enquiry is full of: a phone number, an
 * email address, a decimal price. A false positive there would block a
 * genuine buyer from sending their own number.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { containsLink } from "@/lib/links";

describe("containsLink", () => {
  it.each([
    ["a spam URL", "https://spam-site.top/promo"],
    ["a bare-domain shortener with a path", "bit.ly/cheap-villa"],
    ["a bare domain woven into Thai text", "ทักมาที่ myagency.co.th นะคะ"],
    ["a Telegram handle", "ทักไลน์หรือ t.me/villaagent ก็ได้"],
    ["a markdown link", "ดูรายละเอียดที่ [ที่นี่](https://example.com/promo)"],
    ["a www. address with no protocol", "www.myagency.com"],
    ["an @mention at the start of a word", "ทักมาที่ @villaagent เลยค่ะ"],
  ])("flags %s", (_label, text) => {
    expect(containsLink(text)).toBe(true);
  });

  it.each([
    ["ordinary Thai prose", "สนใจโครงการนี้มากค่ะ อยากนัดดูวิลล่าเร็วๆ นี้"],
    ["a phone number with dashes", "โทร 081-234-5678 หรือ james@gmail.com"],
    ["a phone number alone", "You can reach me at 081-234-5678"],
    ["an email address alone", "james@gmail.com"],
    ["a decimal price in Thai", "งบประมาณประมาณ 1.5 ล้านบาท"],
    ["a decimal price with more precision", "24.5 ล้านบาทได้ไหมคะ"],
    ["plain Chinese prose", "我对这个别墅很感兴趣，想安排看房"],
    ["plain Russian prose", "Меня интересует эта вилла, хочу записаться на просмотр"],
    ["an empty message", ""],
  ])("does not flag %s", (_label, text) => {
    expect(containsLink(text)).toBe(false);
  });
});
