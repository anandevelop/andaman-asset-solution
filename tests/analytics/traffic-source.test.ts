/**
 * tests/analytics/traffic-source.test.ts
 * Where a visit came from, and which links count as a contact click.
 */

import { describe, expect, it } from "vitest";
import { classifyVisit, normalizeHost } from "@/lib/analytics/traffic-source";
import { actionForHref } from "@/lib/analytics/click-actions";

describe("classifyVisit", () => {
  it.each([
    ["chatgpt.com", "chatgpt"],
    ["chat.openai.com", "chatgpt"],
    ["gemini.google.com", "gemini"],
    ["www.perplexity.ai", "perplexity"],
    ["claude.ai", "claude"],
    ["copilot.microsoft.com", "copilot"],
    ["chat.deepseek.com", "deepseek"],
  ])("files %s under AI as %s", (referrer, source) => {
    expect(classifyVisit({ referrer })).toEqual({ channel: "AI", source });
  });

  it("recognises ChatGPT by its utm tag when the referrer was stripped", () => {
    expect(classifyVisit({ referrer: "", utmSource: "chatgpt.com" })).toEqual({ channel: "AI", source: "chatgpt" });
  });

  it("does not mistake Gemini for Google search, or Google for AI", () => {
    expect(classifyVisit({ referrer: "www.google.co.th" })).toEqual({ channel: "SEARCH", source: "google" });
    expect(classifyVisit({ referrer: "news.google.com" })).toEqual({ channel: "SEARCH", source: "google" });
  });

  it("files social hosts, including their redirectors", () => {
    expect(classifyVisit({ referrer: "l.facebook.com" })).toEqual({ channel: "SOCIAL", source: "facebook" });
    expect(classifyVisit({ referrer: "lm.facebook.com" }).source).toBe("facebook");
    expect(classifyVisit({ referrer: "line.me" })).toEqual({ channel: "SOCIAL", source: "line" });
    expect(classifyVisit({ referrer: "t.co" }).source).toBe("x");
  });

  it("does not match a host that only ends in the same letters", () => {
    expect(classifyVisit({ referrer: "notfacebook.com" })).toEqual({ channel: "REFERRAL", source: "notfacebook.com" });
  });

  it("treats ad clicks as campaigns", () => {
    expect(classifyVisit({ referrer: "www.google.com", gclid: true })).toEqual({ channel: "CAMPAIGN", source: "google-ads" });
    expect(classifyVisit({ referrer: "", utmSource: "facebook", utmMedium: "cpc" })).toEqual({
      channel: "CAMPAIGN",
      source: "facebook",
    });
  });

  it("counts an organic Facebook click (fbclid) as social, not paid", () => {
    expect(classifyVisit({ referrer: "", fbclid: true })).toEqual({ channel: "SOCIAL", source: "facebook" });
  });

  it("keeps an unknown utm source as a campaign", () => {
    expect(classifyVisit({ utmSource: "Newsletter Nov" })).toEqual({ channel: "CAMPAIGN", source: "newsletter-nov" });
  });

  it("falls back to referral, then direct", () => {
    expect(classifyVisit({ referrer: "www.ddproperty.com" })).toEqual({ channel: "REFERRAL", source: "ddproperty.com" });
    expect(classifyVisit({})).toEqual({ channel: "DIRECT", source: "direct" });
  });

  it("normalises hosts", () => {
    expect(normalizeHost("WWW.Example.com:443")).toBe("example.com");
  });
});

describe("actionForHref", () => {
  it.each([
    ["tel:+6676123456", "phone"],
    ["mailto:sales@example.com", "email"],
    ["https://line.me/R/ti/p/@andaman", "line"],
    ["https://lin.ee/abc", "line"],
    ["https://wa.me/66812345678", "whatsapp"],
    ["https://api.whatsapp.com/send?phone=66", "whatsapp"],
    ["https://m.me/andaman", "messenger"],
    ["https://maps.app.goo.gl/xyz", "map"],
    ["https://www.google.com/maps/place/Phuket", "map"],
    ["https://cdn.example.com/brochure/victory.pdf", "brochure"],
  ])("%s → %s", (href, action) => {
    expect(actionForHref(href)).toBe(action);
  });

  it("ignores ordinary links", () => {
    expect(actionForHref("https://andamanassetsolution.com/th/projects/victory")).toBeNull();
    expect(actionForHref("https://www.google.com/search?q=x")).toBeNull();
    expect(actionForHref("")).toBeNull();
    expect(actionForHref("/th/contact")).toBeNull();
  });
});
