/**
 * tests/projects-hero.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The /projects banner's precedence rules (lib/projects-hero.ts): an
 * override wins field by field and language by language, blank or
 * whitespace is "not overridden", and the caption follows the photograph.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProjectsHero, type ProjectsHeroOverrides } from "@/lib/projects-hero";
import { isOwnMediaUrl, SETTING_VALIDATORS } from "@/lib/validations";

const blank = { th: "", en: "", zh: "", ru: "" };

const none: ProjectsHeroOverrides = {
  imageUrl: "",
  imageCaption: "",
  eyebrow: blank,
  title: blank,
  subtitle: blank,
};

const fallback = {
  eyebrow: "Our Developments",
  title: "Projects",
  subtitle: "A short list of Phuket developments.",
  creditSuffix: "background image",
  project: {
    name: "The Residence Prime",
    location: "Laguna Area",
    heroImageUrl: "https://cdn.test/residence.jpg",
  },
};

describe("resolveProjectsHero", () => {
  it("is exactly the old banner when nothing is overridden", () => {
    expect(resolveProjectsHero(none, "en", fallback)).toEqual({
      eyebrow: "Our Developments",
      title: "Projects",
      subtitle: "A short list of Phuket developments.",
      image: { url: "https://cdn.test/residence.jpg", alt: "The Residence Prime, Laguna Area" },
      credit: { name: "The Residence Prime", suffix: "background image" },
    });
  });

  it("overrides only the fields, and only the language, that were filled", () => {
    const hero = resolveProjectsHero(
      { ...none, title: { ...blank, th: "โครงการของเรา" } },
      "th",
      fallback,
    );
    expect(hero.title).toBe("โครงการของเรา");
    expect(hero.eyebrow).toBe("Our Developments");

    expect(resolveProjectsHero({ ...none, title: { ...blank, th: "โครงการของเรา" } }, "en", fallback).title).toBe(
      "Projects",
    );
  });

  it("treats whitespace as not overridden", () => {
    expect(resolveProjectsHero({ ...none, subtitle: { ...blank, en: "   " } }, "en", fallback).subtitle).toBe(
      "A short list of Phuket developments.",
    );
  });

  it("uses an uploaded photograph, captioned only if a caption was given", () => {
    const uncaptioned = resolveProjectsHero({ ...none, imageUrl: "https://cdn.test/own.jpg" }, "en", fallback);
    expect(uncaptioned.image).toEqual({ url: "https://cdn.test/own.jpg", alt: "Projects" });
    // Not "The Residence Prime": that project is not in this photograph.
    expect(uncaptioned.credit).toBeNull();

    const captioned = resolveProjectsHero(
      { ...none, imageUrl: "https://cdn.test/own.jpg", imageCaption: "The Victory" },
      "en",
      fallback,
    );
    expect(captioned.image?.alt).toBe("The Victory");
    expect(captioned.credit).toEqual({ name: "The Victory", suffix: "background image" });
  });

  it("lets a caption rename the first project's photograph", () => {
    expect(resolveProjectsHero({ ...none, imageCaption: "Residence Prime, Laguna" }, "en", fallback).credit?.name).toBe(
      "Residence Prime, Laguna",
    );
  });

  it("has no photo and no caption when there is neither an upload nor a project photo", () => {
    const hero = resolveProjectsHero({ ...none, imageCaption: "Orphan" }, "en", { ...fallback, project: null });
    expect(hero.image).toBeNull();
    expect(hero.credit).toBeNull();
  });
});

describe("the banner image setting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const validate = (value: string) => SETTING_VALIDATORS["projectsHero.imageUrl"]!.safeParse(value).success;

  it("accepts our own uploads, on the CDN name or the bare Spaces origin, and /public paths", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_DOMAIN", "media.sgp1.cdn.digitaloceanspaces.com");

    expect(validate("https://media.sgp1.cdn.digitaloceanspaces.com/uploads/hero.webp")).toBe(true);
    expect(validate("https://media.sgp1.digitaloceanspaces.com/uploads/hero.jpg")).toBe(true);
    expect(validate("/gallery/trinity-village/pool-garden.webp")).toBe(true);
  });

  it("refuses a link to another site, which would take the whole page down through next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_DOMAIN", "media.sgp1.cdn.digitaloceanspaces.com");

    expect(validate("https://example.com/villa.jpg")).toBe(false);
    expect(validate("https://media.sgp1.cdn.digitaloceanspaces.com.evil.test/x.jpg")).toBe(false);
    expect(validate("//media.sgp1.cdn.digitaloceanspaces.com/x.jpg")).toBe(false);
    expect(validate("http://media.sgp1.cdn.digitaloceanspaces.com/x.jpg")).toBe(false);
  });

  it("refuses anything that is not a raster image", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_DOMAIN", "media.sgp1.cdn.digitaloceanspaces.com");

    expect(validate("https://media.sgp1.cdn.digitaloceanspaces.com/uploads/brochure.pdf")).toBe(false);
    expect(validate("https://media.sgp1.cdn.digitaloceanspaces.com/uploads/logo.svg")).toBe(false);
  });

  it("allows only /public paths when no media host is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_DOMAIN", "");

    expect(isOwnMediaUrl("/gallery/x.webp")).toBe(true);
    expect(isOwnMediaUrl("https://anything.test/x.webp")).toBe(false);
  });
});
