import { describe, expect, it } from "vitest";
import { localizeHref } from "@/lib/localize-href";

/*
  Editor-typed links, given the reader's locale. The home hero's
  "/projects/residence-prime" sent English readers to the Thai page.
*/
describe("localizeHref", () => {
  it.each([
    ["/projects/residence-prime", "en", "/en/projects/residence-prime"],
    ["/contact?from=hero#form", "zh", "/zh/contact?from=hero#form"],
    ["/", "ru", "/ru"],
  ])("puts the locale in front of %s", (href, locale, expected) => {
    expect(localizeHref(href, locale)).toBe(expected);
  });

  it.each([
    ["/th/projects/victory"],
    ["/en"],
    ["https://andamanassetsolution.com/en/contact"],
    ["//evil.example/x"],
    ["mailto:info@andamanassetsolution.com"],
    ["tel:+66953089559"],
    ["#enquire"],
    ["/brochures/residence-prime.pdf"],
    ["/api/leads"],
  ])("leaves %s as typed", (href) => {
    expect(localizeHref(href, "en")).toBe(href);
  });
});
