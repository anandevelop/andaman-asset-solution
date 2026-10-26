import { describe, expect, it } from "vitest";
import { isStaffPath } from "@/lib/analytics";

/* GA and the Pixel never measure the back office or the sign-in page. */
describe("isStaffPath", () => {
  it.each(["/th/admin", "/en/admin/leads/abc?status=NEW", "/th/login", "/admin", "/en/login/"])("%s is staff", (path) => {
    expect(isStaffPath(path)).toBe(true);
  });
  it.each(["/en", "/th/projects/victory", "/en/administration-fees", "/en/news/login-tips", "/"])("%s is public", (path) => {
    expect(isStaffPath(path)).toBe(false);
  });
});
