/**
 * tests/env.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The boot-time environment check.
 *
 * Every case here is a real production failure that used to present as
 * something else entirely: a missing NEXTAUTH_SECRET as "the password is
 * wrong", a trailing slash on NEXT_PUBLIC_SITE_URL as duplicate canonical
 * URLs in Search Console. The point of the check is that the container
 * refuses to start instead, so these assertions are about *which* problems
 * are fatal — not merely that something was logged.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertEnv, collectEnvProblems } from "@/lib/env";

const ORIGINAL = process.env;

/** A complete, valid environment — each test breaks exactly one thing. */
function validEnv(): NodeJS.ProcessEnv {
  return {
    ...ORIGINAL,
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db:5432/andaman?schema=public",
    NEXTAUTH_SECRET: "a".repeat(44),
    NEXTAUTH_URL: "https://andamanassetsolution.com",
    NEXT_PUBLIC_SITE_URL: "https://andamanassetsolution.com",
    NEXT_PUBLIC_MEDIA_DOMAIN: "media.example.com",
    DO_SPACES_ACCESS_KEY_ID: "key",
    SMTP_HOST: "smtp.example.com",
    RECAPTCHA_SECRET_KEY: "secret",
  } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  process.env = validEnv();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = ORIGINAL;
  vi.restoreAllMocks();
});

describe("collectEnvProblems", () => {
  it("finds nothing wrong with a complete environment", () => {
    const { fatal, warnings } = collectEnvProblems();
    expect(fatal).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it.each(["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"])(
    "treats a missing %s as fatal",
    (name) => {
      delete process.env[name];
      expect(collectEnvProblems().fatal.map((p) => p.name)).toContain(name);
    },
  );

  it("treats a whitespace-only value as missing", () => {
    process.env.NEXTAUTH_SECRET = "   ";
    expect(collectEnvProblems().fatal.map((p) => p.name)).toContain("NEXTAUTH_SECRET");
  });

  it("rejects a NEXTAUTH_SECRET short enough to brute-force", () => {
    process.env.NEXTAUTH_SECRET = "too-short";
    const problem = collectEnvProblems().fatal.find((p) => p.name === "NEXTAUTH_SECRET");
    expect(problem?.detail).toMatch(/at least 32/);
  });

  it.each(["NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"])(
    "rejects a trailing slash on %s",
    (name) => {
      process.env[name] = "https://andamanassetsolution.com/";
      const problem = collectEnvProblems().fatal.find((p) => p.name === name);
      expect(problem?.detail).toMatch(/trailing slash/);
    },
  );

  it.each(["NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"])("rejects plain http on %s", (name) => {
    process.env[name] = "http://andamanassetsolution.com";
    const problem = collectEnvProblems().fatal.find((p) => p.name === name);
    expect(problem?.detail).toMatch(/https/);
  });

  /*
    The e2e suite runs `next start` — so NODE_ENV=production — against
    http://127.0.0.1:3100. Refusing plain http outright would make this
    check fail CI rather than a bad deploy.
  */
  it.each(["http://127.0.0.1:3100", "http://localhost:3000"])(
    "allows plain http on the loopback origin %s",
    (origin) => {
      process.env.NEXTAUTH_URL = origin;
      process.env.NEXT_PUBLIC_SITE_URL = origin;
      expect(collectEnvProblems().fatal).toEqual([]);
    },
  );

  it("warns — but does not fail — on a missing optional integration", () => {
    delete process.env.SMTP_HOST;
    const { fatal, warnings } = collectEnvProblems();
    expect(fatal).toEqual([]);
    expect(warnings.map((w) => w.name)).toContain("SMTP_HOST");
  });
});

describe("assertEnv", () => {
  it("throws in production when something fatal is missing", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => assertEnv()).toThrow(/NEXTAUTH_SECRET/);
  });

  it("names every problem at once rather than one per restart", () => {
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DATABASE_URL;
    expect(() => assertEnv()).toThrow(/DATABASE_URL[\s\S]*NEXTAUTH_SECRET/);
  });

  it("only warns outside production, so `next dev` still starts", () => {
    // NODE_ENV is typed as a readonly literal union; the whole object is
    // already a test-owned copy, so replacing it is the honest way in.
    process.env = { ...process.env, NODE_ENV: "development" } as NodeJS.ProcessEnv;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => assertEnv()).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it("passes silently when everything is set", () => {
    expect(() => assertEnv()).not.toThrow();
  });

  /*
    Next runs the instrumentation hook inside the build worker too, where
    the environment is deliberately incomplete — the Dockerfile's builder
    stage passes a placeholder DATABASE_URL and no secrets at all. Enforcing
    there would fail every `docker build`, and "fix it by baking the real
    NEXTAUTH_SECRET into an image layer" is the wrong fix.
  */
  it("stays out of the way during `next build`", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.DATABASE_URL;
    expect(() => assertEnv()).not.toThrow();
  });
});
