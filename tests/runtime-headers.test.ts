import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  The CSP and the staging noindex are read per request (lib/runtime-headers.ts)
  because next.config.js headers() is frozen at build. These pin both halves:
  the runtime switch works, and nothing sneaks the switch back into the
  build-time config, where setting it on the container would do nothing.
*/

const ENV = { ...process.env };

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ENV, CSP_POLICY_REPORT_ONLY: "default-src 'self'", CSP_POLICY_ENFORCED: "default-src 'self'; upgrade-insecure-requests", ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  return import("@/lib/runtime-headers");
}

afterEach(() => {
  process.env = { ...ENV };
});

describe("applyRuntimeHeaders", () => {
  it("marks every page noindex until SITE_INDEXABLE is true", async () => {
    const { applyRuntimeHeaders } = await load({ SITE_INDEXABLE: undefined });
    const headers = new Headers();
    applyRuntimeHeaders(headers);
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("drops the noindex on the canonical site", async () => {
    const { applyRuntimeHeaders } = await load({ SITE_INDEXABLE: "true" });
    const headers = new Headers();
    applyRuntimeHeaders(headers);
    expect(headers.get("X-Robots-Tag")).toBeNull();
  });

  it("sends the CSP as Report-Only by default", async () => {
    const { applyRuntimeHeaders } = await load({ CSP_ENFORCE: undefined });
    const headers = new Headers();
    applyRuntimeHeaders(headers);
    expect(headers.get("Content-Security-Policy-Report-Only")).toBe("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toBeNull();
  });

  it("enforces the CSP when CSP_ENFORCE is true at runtime", async () => {
    const { applyRuntimeHeaders } = await load({ CSP_ENFORCE: "true" });
    const headers = new Headers();
    applyRuntimeHeaders(headers);
    expect(headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
});

describe("next.config.js", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.js"), "utf8");
  const headersFn = config.slice(config.indexOf("async headers()"), config.indexOf("async redirects()") > config.indexOf("async headers()") ? config.indexOf("async redirects()") : undefined);

  it("does not decide the noindex or the CSP mode at build time", () => {
    expect(headersFn).not.toContain("SITE_INDEXABLE");
    expect(headersFn).not.toContain("Content-Security-Policy");
    expect(config).not.toMatch(/process\.env\.CSP_ENFORCE/);
  });

  it("hands both policies to the proxy", () => {
    expect(config).toContain("CSP_POLICY_REPORT_ONLY: buildCsp(false)");
    expect(config).toContain("CSP_POLICY_ENFORCED: buildCsp(true)");
  });
});

describe("proxy.ts", () => {
  it("applies the runtime headers to every response it returns", () => {
    const proxy = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toMatch(/const response = await route\(request, event\);\s+\/\/[^\n]*\n\s+applyRuntimeHeaders\(response\.headers\);/);
  });
});

describe("app/robots.ts", () => {
  it("is rendered per request, so SITE_INDEXABLE at runtime decides it", () => {
    const robots = readFileSync(path.join(process.cwd(), "app", "robots.ts"), "utf8");
    expect(robots).toContain('export const dynamic = "force-dynamic"');
  });
});
