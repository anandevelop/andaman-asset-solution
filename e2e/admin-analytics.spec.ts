/**
 * e2e/admin-analytics.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every tab of /admin/analytics actually renders.
 *
 * WHY A BROWSER, WHEN THE PAGE HAS UNIT TESTS UNDER IT
 *
 * The realtime tab shipped with its two dynamic labels passed down as
 * functions — `duration: (ms) => string` on a Client Component's props.
 * TypeScript is happy with it, every unit test stayed green, and the page
 * threw "Functions cannot be passed directly to Client Components" on the
 * server: /admin/analytics rendered its error boundary and no tab at all,
 * for every role and every locale. Nothing in this repository could have
 * caught that except loading the page.
 *
 * So the assertion is deliberately shallow and the coverage deliberately
 * wide: click every tab, in both a Latin and a Thai locale, and require
 * that the error boundary is absent and the panel drew something. It is
 * not checking numbers — tests/analytics/* covers the arithmetic. It is
 * checking that the screen exists at all, which turns out to be the part
 * that broke.
 *
 * Both locales because a render error can come from one message file's
 * own shape and not another's.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";

/** Tab buttons in display order, per locale. */
const TABS = {
  en: ["Live", "Web Vitals", "Traffic", "Content", "Leads"],
  th: ["เรียลไทม์", "Core Web Vitals", "ทราฟฟิก", "เนื้อหา", "ลีด"],
} as const;

/*
  The two panels this suite owns, by text only they render.

  Each pattern accepts the panel's empty state as well as its populated
  one, because the empty state is what the suite actually sees: the e2e
  database is created fresh per run and nothing in it has ever rolled up a
  Core Web Vital or recorded a live visit. VitalsPanel in particular
  returns early when there is nothing to show and never renders its own
  title, so matching only the title would assert that the fixtures have
  data rather than that the screen works.
*/
const OWNED_TEXT = {
  en: {
    Live: /on the site right now|nobody is on the site/i,
    "Web Vitals": /core web vitals|no measurements rolled up/i,
  },
  th: {
    เรียลไทม์: /กำลังอยู่ในเว็บตอนนี้|ตอนนี้ไม่มีใครอยู่ในเว็บ/,
    "Core Web Vitals": /core web vitals|ยังไม่มีข้อมูลที่สรุปรายวัน/i,
  },
} as const;

/*
  Serial, and both sign-ins happen on the English login page.

  Two reasons, both learned the hard way. sign-in.ts finds its fields by
  their English labels, so the Thai login form is not something it can
  drive — and a session does not belong to a locale anyway, so signing in
  at /en/login and then opening /th/admin/analytics tests exactly what it
  needs to. Serial because nextAccount()'s cursor is module state: two
  parallel workers are two processes, both start at zero, and the second
  one's account has already spent its TOTP step.
*/
test.describe.configure({ mode: "serial" });

// Two full sign-ins plus ten tab renders against a dev server that is
// compiling as it goes; the 60s default is a budget for one page.
test.setTimeout(120_000);

for (const locale of ["en", "th"] as const) {
  test(`every analytics tab renders in ${locale}`, async ({ page }) => {
    /*
      Visited twice, and the first visit is thrown away.

      harness.ts makes every goto wait for networkidle, which is the right
      gate once the page's chunks exist. Locally the suite runs `next dev`,
      which compiles a route — and its client bundle — on first request, so
      for whichever spec happens to touch /en/login first the network goes
      quiet in the gap *between* those compiles. networkidle resolves, the
      test fills the form, clicks, and the click lands on a page React has
      not attached to yet: the browser submits the form the way HTML does
      and the server log shows the giveaway —

        GET /en/login?email=e2e-admin-1%40andaman.test&password=...

      — credentials in the query string, no session, no error banner, and a
      test that sits on the login form until it times out.

      Every other spec is spared this by accident: admin-login.spec.ts opens
      /en/login in an earlier test, so by the time one of its tests signs in
      the route is warm. This file is the only one that signs in as its very
      first action, so it warms the route itself rather than depending on
      what else happens to run first.
    */
    await page.goto("/en/login");
    await page.goto("/en/login");

    await signIn(page);
    await expect(page).toHaveURL(/\/admin/);

    await page.goto(`/${locale}/admin/analytics`);

    for (const tab of TABS[locale]) {
      await page.getByRole("button", { name: tab, exact: true }).first().click();

      /*
        The admin error boundary, which is what a server render error
        produces here rather than a failed navigation — the route still
        answers 200 with a working shell and the boundary inside it, so
        asserting on the response status would have missed the very bug
        this file exists for.
      */
      await expect(page.getByText(/something went wrong|เกิดข้อผิดพลาด/i)).toHaveCount(0);

      const owned = (OWNED_TEXT[locale] as Record<string, RegExp>)[tab];
      if (owned) await expect(page.getByText(owned).first()).toBeVisible();
    }
  });
}
