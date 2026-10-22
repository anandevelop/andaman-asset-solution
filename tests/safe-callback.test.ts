import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "@/lib/safe-callback";

/*
  The login page's callbackUrl. "/\evil.example" and "/<TAB>/evil.example"
  passed the old startsWith("/") check and resolved to another site.
*/
describe("safeCallbackUrl", () => {
  it.each([
    ["/th/admin", "/th/admin"],
    ["/en/admin/leads?status=NEW#top", "/en/admin/leads?status=NEW#top"],
    ["/th/admin/projects/abc/edit", "/th/admin/projects/abc/edit"],
  ])("keeps the admin page %s", (raw, expected) => {
    expect(safeCallbackUrl(raw, "th")).toBe(expected);
  });

  it.each([
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["//evil.example"],
    ["https://evil.example/th/admin"],
    ["javascript:alert(1)"],
    ["/th/news"],
    ["/th/administrator"],
    ["/%5Cevil.example"],
    [""],
  ])("refuses %j", (raw) => {
    expect(safeCallbackUrl(raw, "en")).toBe("/en/admin");
  });
});
