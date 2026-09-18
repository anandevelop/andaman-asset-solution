/**
 * scripts/seo-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Proves the Google side of the SEO dashboard actually works, before a
 * cron job at 03:00 is the thing that finds out it does not.
 *
 * Six variables being present is not the same as six working connections.
 * The failure that matters here is specific and silent: a service-account
 * key can be perfectly valid — it mints an access token, the JSON parses,
 * nothing throws — and still be refused by every property, because
 * creating a key in Google Cloud grants access to Google Cloud, not to a
 * Search Console property or a GA4 property. Those are separate invite
 * lists, and a service account has to be added to each one by hand. The
 * symptom is a 403 that looks like a bad key, so this script separates
 * the two: it mints the token first and reports that as its own step, and
 * only then asks each property whether it will answer.
 *
 * Everything below is read-only. No sync runs, nothing is written to
 * Postgres, and the one URL submitted anywhere (IndexNow) is not
 * submitted at all — only the key file it would be signed with is read.
 *
 * Nothing here is required for the dashboard to run. Three of the four
 * pillars compute from rows this project already owns; the checks below
 * cover the fourth, so an unconfigured connection is reported as skipped
 * rather than failed.
 *
 * Run with:  npm run seo:check
 * ─────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import { loadEnv, OK, FAIL, DIM, RESET } from "./spaces-runtime";

loadEnv();

const WARN = "\x1b[33m!\x1b[0m";
const SKIP = "\x1b[2m·\x1b[0m";
const BOLD = "\x1b[1m";

/** Scopes the dashboard's cron jobs need. Read-only, deliberately. */
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
].join(" ");

const TOKEN_URL = "https://oauth2.googleapis.com/token";

const fixes: string[] = [];
let failures = 0;

function line(icon: string, label: string, detail = ""): void {
  console.log(`  ${icon} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}

function fail(label: string, detail: string, ...remedy: string[]): void {
  failures += 1;
  line(FAIL, label, detail);
  fixes.push(...remedy);
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * `fetch` with a deadline. A misconfigured proxy or a DNS black hole
 * otherwise leaves this script hanging with no output at all, which reads
 * as "the check itself is broken".
 */
type ApiResponse = { status: number; body: Record<string, unknown> };

async function request(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<ApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = { error: text.slice(0, 200) };
    }
    return { status: response.status, body: parsed };
  } catch (error) {
    const reason = (error as Error).name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : (error as Error).message;
    return { status: 0, body: { error: reason } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The same deadline, but for a response that is not JSON — the IndexNow
 * key file is plain text, and a key of all digits would otherwise parse
 * as a JSON number and compare unequal to its own string.
 */
async function requestText(url: string, timeoutMs = 10_000): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Google's error envelope is consistent enough to read one way. */
function apiMessage(body: Record<string, unknown>): string {
  const error = body.error;
  if (typeof error === "string") return (body.error_description as string) ?? error;
  if (error && typeof error === "object") {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return "";
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; stage: "sign" | "exchange"; detail: string };

/**
 * Mints an access token straight from the service-account key.
 *
 * Done by hand rather than through `googleapis` on purpose: the check
 * should not depend on a 60 MB client library the app itself does not
 * install, and signing the assertion here means a malformed private key
 * fails at the signature step with a readable message instead of being
 * buried inside a library's retry loop.
 */
async function mintAccessToken(email: string, privateKey: string): Promise<TokenResult> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPES, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }),
  );

  let signature: string;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    signature = signer.sign(privateKey, "base64url");
  } catch (error) {
    return { ok: false, stage: "sign", detail: (error as Error).message };
  }

  const { status, body } = await request(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }).toString(),
  });

  if (status !== 200 || typeof body.access_token !== "string") {
    return { ok: false, stage: "exchange", detail: apiMessage(body) || `HTTP ${status}` };
  }
  return { ok: true, token: body.access_token };
}

function authed(token: string, extra: RequestInit = {}): RequestInit {
  return {
    ...extra,
    headers: { ...(extra.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
}

/** YYYY-MM-DD, `daysAgo` days back. Search Console lags ~2–3 days. */
function isoDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  console.log(`\n  ${BOLD}SEO connection check${RESET}\n`);

  const saEmail = env("GOOGLE_SA_EMAIL");
  const saKeyRaw = env("GOOGLE_SA_PRIVATE_KEY");
  const gscSite = env("GSC_SITE_URL");
  const ga4Property = env("GA4_PROPERTY_ID");
  const psiKey = env("PAGESPEED_API_KEY");
  const indexNowKey = env("INDEXNOW_KEY");
  const cronSecret = env("CRON_SECRET");
  const siteUrl = env("NEXT_PUBLIC_SITE_URL").replace(/\/+$/, "");

  console.log(`  ${DIM}service account ${RESET}${saEmail || "(not set)"}`);
  console.log(`  ${DIM}search console  ${RESET}${gscSite || "(not set)"}`);
  console.log(`  ${DIM}ga4 property    ${RESET}${ga4Property || "(not set)"}`);
  console.log(`  ${DIM}site            ${RESET}${siteUrl || "(not set)"}\n`);

  // ── 1. The key itself ─────────────────────────────────────────────────
  let token: string | null = null;

  if (!saEmail || !saKeyRaw) {
    line(SKIP, "Service account", "GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY not set");
    fixes.push("Set GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY from the downloaded JSON key.");
  } else {
    // The JSON field carries literal \n escapes; .env keeps them literal too.
    const privateKey = saKeyRaw.replace(/\\n/g, "\n");

    if (!privateKey.includes("BEGIN PRIVATE KEY")) {
      fail(
        "Service account",
        "GOOGLE_SA_PRIVATE_KEY does not look like a PEM key",
        'Copy the "private_key" field of the JSON verbatim, including the',
        "  -----BEGIN PRIVATE KEY----- header, wrapped in double quotes.",
      );
    } else {
      const result = await mintAccessToken(saEmail, privateKey);

      if (result.ok) {
        token = result.token;
        line(OK, "Service account", "access token minted");
      } else if (result.stage === "sign") {
        fail(
          "Service account",
          `key rejected by OpenSSL — ${result.detail}`,
          "The private key is truncated or its \\n escapes were expanded twice.",
          "  Re-paste it on a single line, in double quotes, straight from the JSON.",
        );
      } else if (/invalid_grant/i.test(result.detail) || /JWT/i.test(result.detail)) {
        fail(
          "Service account",
          result.detail,
          "invalid_grant usually means this machine's clock is off by more than",
          "  a few minutes, or the key was deleted in Google Cloud. Check both.",
        );
      } else {
        fail("Service account", result.detail, "Check that the key has not been disabled in Google Cloud → IAM.");
      }
    }
  }

  // ── 2. Search Console: is the account actually on the property? ───────
  let gscReachable = false;

  if (!token || !gscSite) {
    line(SKIP, "Search Console", token ? "GSC_SITE_URL not set" : "no access token");
  } else {
    const { status, body } = await request(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSite)}`,
      authed(token),
    );

    if (status === 200) {
      gscReachable = true;
      line(OK, "Search Console", `permission: ${String(body.permissionLevel ?? "unknown")}`);
    } else if (status === 403) {
      fail(
        "Search Console",
        "403 — the key is valid, the property is not shared with it",
        `Search Console → Settings → Users and permissions → Add user`,
        `  Paste ${saEmail || "the service account email"}, permission "Full" or "Restricted".`,
      );
    } else if (status === 404) {
      fail(
        "Search Console",
        `404 — no property spelled "${gscSite}"`,
        "GSC_SITE_URL must match the property exactly:",
        "  domain property  →  sc-domain:andamanassetsolution.com",
        "  URL prefix       →  https://andamanassetsolution.com/  (trailing slash)",
      );
    } else {
      fail("Search Console", `HTTP ${status} — ${apiMessage(body) || "unexpected response"}`, "");
    }
  }

  // ── 3. Search analytics: does data actually come back? ────────────────
  if (!gscReachable || !token) {
    line(SKIP, "Search analytics", "needs a reachable property");
  } else {
    const { status, body } = await request(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSite)}/searchAnalytics/query`,
      authed(token, {
        method: "POST",
        body: JSON.stringify({
          startDate: isoDate(30),
          endDate: isoDate(3),
          dimensions: ["date"],
          rowLimit: 5,
        }),
      }),
    );

    const rows = (Array.isArray(body.rows) ? body.rows : []) as Array<{ clicks?: number }>;

    if (status !== 200) {
      fail("Search analytics", `HTTP ${status} — ${apiMessage(body)}`, "");
    } else if (rows.length === 0) {
      line(WARN, "Search analytics", "reachable, but no rows in the last 30 days");
      fixes.push("Search Console returned no data — normal for a property verified recently.");
    } else {
      const clicks = rows.reduce((sum: number, row) => sum + Number(row.clicks ?? 0), 0);
      line(OK, "Search analytics", `${rows.length} days sampled, ${clicks} clicks`);
    }
  }

  // ── 4. URL Inspection: the quota-limited one, worth proving early ─────
  if (!gscReachable || !token || !siteUrl) {
    line(SKIP, "URL Inspection", "needs a reachable property");
  } else {
    const { status, body } = await request(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      authed(token, {
        method: "POST",
        body: JSON.stringify({ inspectionUrl: `${siteUrl}/`, siteUrl: gscSite, languageCode: "th" }),
      }),
      20_000,
    );

    const inspection = body.inspectionResult as
      | { indexStatusResult?: { verdict?: string; coverageState?: string } }
      | undefined;
    const coverage = inspection?.indexStatusResult?.coverageState;

    if (status === 200 && coverage) {
      line(OK, "URL Inspection", `homepage: ${coverage}`);
    } else if (status === 403) {
      fail(
        "URL Inspection",
        "403 — enabled for the project, but refused for this property",
        "URL Inspection needs the same property share as Search Console above,",
        "  and the Search Console API enabled in Google Cloud → APIs & Services.",
      );
    } else if (status === 429) {
      line(WARN, "URL Inspection", "429 — daily quota already spent (2,000 URLs/day)");
    } else {
      fail("URL Inspection", `HTTP ${status} — ${apiMessage(body) || "no inspection result"}`, "");
    }
  }

  // ── 5. GA4 ────────────────────────────────────────────────────────────
  if (!token || !ga4Property) {
    line(SKIP, "GA4 Data API", token ? "GA4_PROPERTY_ID not set" : "no access token");
  } else if (!/^\d+$/.test(ga4Property)) {
    fail(
      "GA4 Data API",
      `"${ga4Property}" is not a numeric property ID`,
      "GA4_PROPERTY_ID is the 9-digit number from GA4 → Admin → Property details,",
      "  not the G-XXXXXXX measurement ID used by the browser tag.",
    );
  } else {
    const { status, body } = await request(
      `https://analyticsdata.googleapis.com/v1beta/properties/${ga4Property}:runReport`,
      authed(token, {
        method: "POST",
        body: JSON.stringify({
          dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
          metrics: [{ name: "sessions" }],
        }),
      }),
    );

    if (status === 200) {
      const rows = (body.rows ?? []) as Array<{ metricValues?: Array<{ value?: string }> }>;
      const sessions = rows[0]?.metricValues?.[0]?.value ?? "0";
      line(OK, "GA4 Data API", `${sessions} sessions in the last 28 days`);
    } else if (status === 403) {
      fail(
        "GA4 Data API",
        "403 — the property is not shared with the service account",
        "GA4 → Admin → Property Access Management → +",
        `  Paste ${saEmail || "the service account email"} with the "Viewer" role.`,
      );
    } else if (status === 404) {
      fail("GA4 Data API", `404 — no property ${ga4Property}`, "Check the ID in GA4 → Admin → Property details.");
    } else {
      fail("GA4 Data API", `HTTP ${status} — ${apiMessage(body)}`, "");
    }
  }

  // ── 6. PageSpeed Insights — slow by nature, so it goes last ───────────
  if (!siteUrl) {
    line(SKIP, "PageSpeed Insights", "NEXT_PUBLIC_SITE_URL not set");
  } else {
    if (!psiKey) console.log(`  ${DIM}(no PAGESPEED_API_KEY — running unauthenticated, this is throttled)${RESET}`);

    const query = new URLSearchParams({ url: `${siteUrl}/`, strategy: "mobile", category: "performance" });
    if (psiKey) query.set("key", psiKey);

    const { status, body } = await request(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query.toString()}`,
      {},
      60_000,
    );

    const lighthouse = body.lighthouseResult as { categories?: { performance?: { score?: number } } } | undefined;
    const score = lighthouse?.categories?.performance?.score;

    if (status === 200 && typeof score === "number") {
      const field = body.loadingExperience ? "CrUX field data available" : "no CrUX field data yet";
      line(OK, "PageSpeed Insights", `performance ${Math.round(score * 100)}/100 · ${field}`);
    } else if (status === 400) {
      fail(
        "PageSpeed Insights",
        `400 — Google could not fetch ${siteUrl}/`,
        "PSI fetches the URL from the public internet. A site that is not yet",
        "  deployed, or is behind basic auth, cannot be measured this way.",
      );
    } else if (status === 429) {
      fail(
        "PageSpeed Insights",
        "429 — rate limited",
        "Set PAGESPEED_API_KEY (Cloud Console → Credentials → API key).",
      );
    } else {
      fail("PageSpeed Insights", `HTTP ${status} — ${apiMessage(body)}`, "");
    }
  }

  // ── 7. IndexNow — a static file, but the one people forget ────────────
  if (!indexNowKey) {
    line(SKIP, "IndexNow", "INDEXNOW_KEY not set");
  } else if (!/^[a-zA-Z0-9-]{8,128}$/.test(indexNowKey)) {
    fail("IndexNow", "key must be 8–128 characters, letters/digits/dashes only", "Generate one with:  openssl rand -hex 16");
  } else if (!siteUrl) {
    line(SKIP, "IndexNow", "NEXT_PUBLIC_SITE_URL not set");
  } else {
    const keyUrl = `${siteUrl}/${indexNowKey}.txt`;
    const { status, text } = await requestText(keyUrl);
    const served = text.trim();

    if (status === 200 && served === indexNowKey) {
      line(OK, "IndexNow", "key file served and matches");
    } else if (status === 200) {
      fail("IndexNow", `${keyUrl} exists but does not contain the key`, "The file must contain the key and nothing else — no newline-terminated JSON, no HTML.");
    } else if (status === 404) {
      fail(
        "IndexNow",
        `404 — ${keyUrl} is not served`,
        `Create public/${indexNowKey}.txt containing exactly the key, then redeploy.`,
      );
    } else {
      line(WARN, "IndexNow", `could not verify (${status || "network"}) — check again after deploy`);
    }
  }

  // ── 8. Cron secret ────────────────────────────────────────────────────
  if (!cronSecret) {
    line(SKIP, "Cron secret", "CRON_SECRET not set");
    fixes.push("Set CRON_SECRET before exposing /api/cron/* :  openssl rand -hex 32");
  } else if (cronSecret.length < 24) {
    fail("Cron secret", `${cronSecret.length} characters — too short to be worth having`, "openssl rand -hex 32");
  } else {
    line(OK, "Cron secret", `${cronSecret.length} characters`);
  }

  report();
}

function report(): void {
  const remedies = fixes.filter(Boolean);

  if (failures === 0 && remedies.length === 0) {
    console.log(`\n  ${OK} Everything the SEO dashboard needs is connected.\n`);
    return;
  }

  if (remedies.length > 0) {
    console.log(`\n  ${BOLD}To fix${RESET}\n`);
    for (const remedy of remedies) console.log(`  ${remedy}`);
  }

  console.log("");
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`\n  ${FAIL} seo-check crashed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
