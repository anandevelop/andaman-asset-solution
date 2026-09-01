/**
 * lib/env.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Fail-fast validation of the environment, run once at server start from
 * instrumentation.ts.
 *
 * Every variable below has a failure mode that is hard to diagnose from
 * the symptom alone:
 *
 *   • NEXTAUTH_SECRET missing  → getToken() in middleware always returns
 *     null, so every admin URL bounces to /login and a correct password
 *     appears to "not work". It is also the TOTP encryption key, so
 *     lib/totp.ts throws on any 2FA operation.
 *   • NEXTAUTH_URL wrong       → the OAuth/callback redirect leaves the
 *     site, or the session cookie is set on the wrong origin.
 *   • DATABASE_URL missing     → /api/health answers 503 forever while the
 *     container itself looks healthy.
 *   • NEXT_PUBLIC_SITE_URL     → canonical URLs, hreflang, the sitemap and
 *     every JSON-LD block silently point at localhost.
 *
 * Crashing on boot is the kinder outcome: an orchestrator reports a
 * container that will not start, rather than one that starts and is
 * quietly wrong. Only enforced when NODE_ENV=production, so `next dev`
 * with a half-filled .env still runs.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** `http://localhost:3000`, `http://127.0.0.1:3100`, `http://[::1]:3000`. */
function isLoopback(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

/** Missing or empty — an empty string in .env is not a value. */
function missing(name: string): boolean {
  return !read(name)?.trim();
}

/**
 * NEXT_PUBLIC_* have to be read as *literal* `process.env.X` expressions.
 *
 * They are compiled into the bundle by webpack's DefinePlugin, which
 * substitutes exactly that source text and nothing else — a dynamic
 * `process.env[name]` lookup sees only what the *container* was given at
 * runtime, which for a correctly built image is nothing at all. Reading
 * them literally is therefore not a style choice: it is the difference
 * between validating the value that was baked in and reporting every
 * properly built image as broken.
 *
 * It also gets the check we actually want — a build that forgot
 * `--build-arg NEXT_PUBLIC_SITE_URL` produces an image whose canonical
 * URLs are empty, and this is where that surfaces.
 */
function publicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_MEDIA_DOMAIN: process.env.NEXT_PUBLIC_MEDIA_DOMAIN,
  };
}

function read(name: string): string | undefined {
  const inlined = publicEnv();
  return name in inlined ? inlined[name] : process.env[name];
}

const REQUIRED = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/**
 * Values that are only *recommended*: the site serves without them, but a
 * feature is silently disabled. Warned about, never fatal.
 */
const RECOMMENDED: Array<[name: string, consequence: string]> = [
  ["NEXT_PUBLIC_MEDIA_DOMAIN", "admin-uploaded images will not render"],
  ["DO_SPACES_ACCESS_KEY_ID", "admin image uploads will fail"],
  ["SMTP_HOST", "lead and RSVP emails are a silent no-op"],
  ["RECAPTCHA_SECRET_KEY", "public forms accept unverified submissions"],
];

export type EnvProblem = { name: string; detail: string };

/** Pure — returns what is wrong rather than throwing, so it is testable. */
export function collectEnvProblems(): {
  fatal: EnvProblem[];
  warnings: EnvProblem[];
} {
  const fatal: EnvProblem[] = [];
  const warnings: EnvProblem[] = [];

  for (const name of REQUIRED) {
    if (missing(name)) fatal.push({ name, detail: "is not set" });
  }

  const secret = read("NEXTAUTH_SECRET")?.trim();
  if (secret && secret.length < 32) {
    fatal.push({
      name: "NEXTAUTH_SECRET",
      detail: `is ${secret.length} characters; use at least 32 (openssl rand -base64 32)`,
    });
  }

  for (const name of ["NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"]) {
    const value = read(name)?.trim();
    if (!value) continue;

    if (value.endsWith("/")) {
      fatal.push({
        name,
        detail: "has a trailing slash — it is concatenated verbatim into URLs",
      });
    }

    // http is only ever acceptable on the loopback address: `next start`
    // in the e2e suite runs with NODE_ENV=production against
    // http://127.0.0.1:3100, and refusing that would make the check fail
    // CI rather than a bad deploy.
    if (!/^https:\/\//.test(value) && !isLoopback(value)) {
      fatal.push({ name, detail: `must be an https:// origin, got "${value}"` });
    }
  }

  for (const [name, consequence] of RECOMMENDED) {
    if (missing(name)) warnings.push({ name, detail: consequence });
  }

  return { fatal, warnings };
}

/**
 * Called from instrumentation.ts. Throws in production, warns elsewhere.
 *
 * Skipped entirely during `next build`. Next runs the instrumentation hook
 * in the build worker as well as at server start, and the build
 * deliberately has no real secrets: the Dockerfile's builder stage and the
 * CI build job both pass a placeholder DATABASE_URL and nothing else,
 * because nothing is queried and no session is issued at build time.
 * Enforcing here would fail the build on an environment that is *correctly*
 * incomplete, and would push real production secrets into image layers to
 * satisfy it.
 */
export function assertEnv(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { fatal, warnings } = collectEnvProblems();

  for (const { name, detail } of warnings) {
    console.warn(`[env] ${name} ${detail}`);
  }

  if (fatal.length === 0) return;

  const report = fatal.map(({ name, detail }) => `  • ${name} ${detail}`).join("\n");

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[env] configuration problems (fatal in production):\n${report}`);
    return;
  }

  throw new Error(
    `Refusing to start — the environment is incomplete:\n${report}\n` +
      `See .env.example, and docs/LAUNCH_CHECKLIST.md §2.`,
  );
}
