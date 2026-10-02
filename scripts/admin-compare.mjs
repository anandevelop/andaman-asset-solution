#!/usr/bin/env node
/**
 * scripts/admin-compare.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * The v4 mockup and the real back office, side by side, one image per
 * screen — for reviewing a visual change without clicking through both.
 * Dev-only; not part of CI.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… [ADMIN_TOTP_SECRET=…] \
 *     node scripts/admin-compare.mjs [--dark] [--mobile]
 *
 * Signs in once through the real login form (a TOTP code is generated
 * when ADMIN_TOTP_SECRET is set) and reuses that session for every page.
 * Each row of ROUTES is captured at 1440×900 — mockup on the left, real on
 * the right — and stitched with sharp into
 * `Claude outputs/compare/<name>[-dark|-mobile].png`, with an index.html
 * gallery beside them. --mobile captures the five key routes at 390×844.
 *
 * BASE_URL defaults to http://localhost:3000. Run with ADMIN_COPILOT=1 on
 * the server to compare the topbar's Copilot button too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate } from "otplib";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const TOTP = process.env.ADMIN_TOTP_SECRET;
const DARK = process.argv.includes("--dark");
const MOBILE = process.argv.includes("--mobile");

if (!EMAIL || !PASSWORD) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (and ADMIN_TOTP_SECRET if the account has 2FA).");
  process.exit(1);
}

const MOCKUP = pathToFileURL(resolve("Claude outputs/andaman-admin-v4-ci-mockup.html")).href;
const OUT = resolve("Claude outputs/compare");

/** [name, mockup hash, real path]. PROJECT is replaced with a real id. */
const ROUTES = [
  ["dashboard", "#/dashboard", "/th/admin"],
  ["leads", "#/leads", "/th/admin/leads"],
  ["appointments", "#/leads/appointments", "/th/admin/appointments"],
  ["sales-team", "#/sales-team", "/th/admin/sales-team"],
  ["projects", "#/projects", "/th/admin/projects"],
  ["project-units", "#/projects/victory/units", "/th/admin/projects/PROJECT/units"],
  ["project-content", "#/projects/victory/content", "/th/admin/projects/PROJECT/content"],
  ["pages-home", "#/pages/home", "/th/admin/pages/home"],
  ["pages-about", "#/pages/about", "/th/admin/pages/about/awards"],
  ["news", "#/news", "/th/admin/news"],
  ["events", "#/events", "/th/admin/events"],
  ["media", "#/media", "/th/admin/media"],
  ["publishing", "#/publishing", "/th/admin/publishing"],
  ["translations", "#/publishing/translations", "/th/admin/publishing/translations"],
  ["seo", "#/seo", "/th/admin/seo"],
  ["seo-keywords", "#/seo/keywords", "/th/admin/seo/keywords"],
  ["seo-urls", "#/seo/urls", "/th/admin/seo/urls"],
  ["analytics", "#/analytics", "/th/admin/analytics"],
  ["reports", "#/reports", "/th/admin/reports"],
  ["users", "#/users", "/th/admin/users"],
  ["activity", "#/activity", "/th/admin/activity"],
  ["settings", "#/settings", "/th/admin/settings"],
  ["account", "#/account", "/th/admin/account"],
];
const MOBILE_ROUTES = new Set(["dashboard", "leads", "projects", "news", "appointments"]);

const viewport = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const suffix = MOBILE ? "-mobile" : DARK ? "-dark" : "";
const theme = DARK ? "dark" : "light";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

// ── Sign in once ─────────────────────────────────────────────────────────
const loginContext = await browser.newContext({ viewport });
const login = await loginContext.newPage();
await login.goto(`${BASE}/en/login`);
await login.getByLabel("Email address").fill(EMAIL);
await login.getByLabel("Password").fill(PASSWORD);
await login.getByRole("button", { name: "Sign in", exact: true }).click();
const codeField = login.getByLabel("Authentication code");
await Promise.race([
  codeField.waitFor({ state: "visible" }).catch(() => {}),
  login.waitForURL(/\/admin/).catch(() => {}),
]);
if (await codeField.isVisible().catch(() => false)) {
  if (!TOTP) throw new Error("This account asks for a code: set ADMIN_TOTP_SECRET.");
  await codeField.fill(await generate({ secret: TOTP }));
  await login.getByRole("button", { name: "Verify code" }).click();
}
await login.waitForURL(/\/admin/, { timeout: 30_000 });
const storageState = await loginContext.storageState();

// One real project id for the workspace routes: the first card's link.
await login.goto(`${BASE}/th/admin/projects`);
const projectHref = await login.locator('a[href*="/admin/projects/"][href$="/edit"]').first().getAttribute("href");
const projectId = projectHref?.split("/admin/projects/")[1]?.split("/")[0] ?? "";
await loginContext.close();

const context = await browser.newContext({ viewport, storageState });
await context.addInitScript((value) => {
  try {
    localStorage.setItem("admin-theme", value);
  } catch {}
}, theme);

const rows = [];
for (const [name, hash, path] of ROUTES) {
  if (MOBILE && !MOBILE_ROUTES.has(name)) continue;
  const page = await context.newPage();

  await page.goto(`${MOCKUP}${hash}`);
  await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
  await page.waitForTimeout(800);
  const mock = await page.screenshot();

  await page.goto(`${BASE}${path.replace("PROJECT", projectId)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const real = await page.screenshot();
  await page.close();

  const gap = 16;
  const file = `${name}${suffix}.png`;
  await sharp({
    create: { width: viewport.width * 2 + gap, height: viewport.height, channels: 3, background: "#1b1f24" },
  })
    .composite([
      { input: mock, left: 0, top: 0 },
      { input: real, left: viewport.width + gap, top: 0 },
    ])
    .png()
    .toFile(join(OUT, file));
  rows.push([name, file]);
  console.log(`✓ ${file}`);
}
await browser.close();

writeFileSync(
  join(OUT, `index${suffix}.html`),
  `<!doctype html><meta charset="utf-8"><title>Admin v4 · mockup vs real${suffix}</title>
<style>body{margin:0;padding:24px;background:#111;color:#ddd;font:14px system-ui}h2{font-weight:500;margin:28px 0 8px}img{width:100%;border-radius:8px}</style>
<p>Left: mockup · right: real${DARK ? " · dark" : ""}${MOBILE ? " · 390×844" : ""}</p>
${rows.map(([name, file]) => `<h2>${name}</h2><img src="${file}" alt="${name}" loading="lazy">`).join("\n")}`,
);
console.log(`→ ${join(OUT, `index${suffix}.html`)}`);
