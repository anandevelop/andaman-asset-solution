import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTrustedImageValue, trustedImageUrl } from "@/lib/trusted-media";

/*
  ogImageUrl and a floor's imageUrl are fetched server-side. Before
  lib/trusted-media.ts an EDITOR could aim either at the droplet's metadata
  service or at an HTML page served back from our own domain. These pin the
  allowlist and the usual ways around one.
*/

const ORIGIN = "https://andamanassetsolution.com";
const MEDIA = "andamanasset-media.sgp1.cdn.digitaloceanspaces.com";
const saved = process.env.NEXT_PUBLIC_MEDIA_DOMAIN;

beforeAll(() => {
  process.env.NEXT_PUBLIC_MEDIA_DOMAIN = `https://${MEDIA}`;
});
afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_MEDIA_DOMAIN;
  else process.env.NEXT_PUBLIC_MEDIA_DOMAIN = saved;
});

describe("trustedImageUrl", () => {
  it.each([
    [`https://${MEDIA}/projects/victory/a.jpg`],
    ["https://andamanasset-media.sgp1.digitaloceanspaces.com/projects/victory/a.jpg"],
    ["https://nwgjexifvlryisfxhhxa.supabase.co/storage/v1/object/public/a.jpg"],
  ])("accepts our media host %s", (url) => {
    expect(trustedImageUrl(url, ORIGIN)?.href).toBe(url);
  });

  it("resolves a site path against the site", () => {
    expect(trustedImageUrl("/floor-plans/a.webp", ORIGIN)?.href).toBe(`${ORIGIN}/floor-plans/a.webp`);
  });

  it.each([
    ["the metadata service", "http://169.254.169.254/metadata/v1/user-data"],
    ["the metadata service over https", "https://169.254.169.254/metadata/v1/user-data"],
    ["localhost", "https://localhost:3000/api/health"],
    ["another site", "https://evil.example/page.html"],
    ["plain http to our host", `http://${MEDIA}/a.jpg`],
    ["our host as userinfo", `https://${MEDIA}@evil.example/a.jpg`],
    ["a lookalike host", `https://${MEDIA}.evil.example/a.jpg`],
    ["a non-default port", `https://${MEDIA}:8443/a.jpg`],
    ["protocol-relative", "//evil.example/a.jpg"],
    ["backslash-relative", "/\\evil.example/a.jpg"],
    ["a file URL", "file:///etc/passwd"],
    ["any supabase project", "https://attacker.supabase.co/a.jpg"],
  ])("refuses %s", (_, url) => {
    expect(trustedImageUrl(url, ORIGIN)).toBeNull();
  });
});

describe("isTrustedImageValue", () => {
  it("lets an optional field stay empty", () => {
    expect(isTrustedImageValue("")).toBe(true);
    expect(isTrustedImageValue(null)).toBe(true);
  });

  it("refuses an outside URL at save time", () => {
    expect(isTrustedImageValue("http://169.254.169.254/")).toBe(false);
  });
});

describe("the fetchers", () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it("check the URL before fetching, and never follow a redirect", () => {
    for (const file of ["lib/og-render.tsx", "lib/floor-plan-images.ts"]) {
      const source = read(file);
      expect(source, file).toContain("trustedImageUrl(url, siteConfig.url)");
      expect(source, file).toContain('redirect: "error"');
    }
  });

  it("pass on raster images only, never SVG or HTML", () => {
    const source = read("lib/trusted-media.ts");
    const types = source.slice(source.indexOf("PASSTHROUGH_IMAGE_TYPES"));
    expect(types).not.toContain("svg");
    expect(types).not.toContain("html");
  });
});
