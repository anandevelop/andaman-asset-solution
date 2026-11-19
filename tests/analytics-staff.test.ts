import { describe, expect, it, vi } from "vitest";
import { isStaffPath, pauseMeasurement } from "@/lib/analytics";

/* GA and the Pixel never measure the back office or the sign-in page. */
describe("isStaffPath", () => {
  it.each(["/th/admin", "/en/admin/leads/abc?status=NEW", "/th/login", "/admin", "/en/login/"])("%s is staff", (path) => {
    expect(isStaffPath(path)).toBe(true);
  });
  it.each(["/en", "/th/projects/victory", "/en/administration-fees", "/en/news/login-tips", "/"])("%s is public", (path) => {
    expect(isStaffPath(path)).toBe(false);
  });
});

/* The loaded scripts count history changes themselves, so they are switched
   off at the source on staff pages and back on afterwards. */
describe("pauseMeasurement", () => {
  it("sets Google's disable flag and revokes the Pixel, then restores both", () => {
    const fbq = vi.fn();
    const target: Record<string, unknown> = { fbq };
    pauseMeasurement(true, "G-TEST", target);
    expect(target["ga-disable-G-TEST"]).toBe(true);
    expect(fbq).toHaveBeenLastCalledWith("consent", "revoke");
    pauseMeasurement(false, "G-TEST", target);
    expect(target["ga-disable-G-TEST"]).toBe(false);
    expect(fbq).toHaveBeenLastCalledWith("consent", "grant");
  });
  it("does nothing without a window or an id", () => {
    const target: Record<string, unknown> = {};
    pauseMeasurement(true, undefined, target);
    expect(Object.keys(target)).toEqual([]);
    expect(() => pauseMeasurement(true, "G-TEST", undefined)).not.toThrow();
  });
});
