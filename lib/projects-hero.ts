/**
 * lib/projects-hero.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the /projects banner shows: the overrides saved at
 * /admin/pages/projects where there are any, the built-in otherwise.
 *
 * Field by field, not all-or-nothing. An editor who changes only the Thai
 * heading should not have to retype the eyebrow and subtitle to keep them,
 * and a language nobody has touched should keep reading the translated
 * copy in messages/ rather than go blank. The overrides arrive as "" when
 * unset (lib/settings.ts defaults every projectsHero key to ""), and
 * whitespace counts as unset — a stray space saved in a box is not a
 * heading.
 *
 * The photograph is the one exception to "the built-in": with no upload it
 * is the first published project's own hero image, which is what the
 * banner showed before any of this was editable. The caption follows the
 * photo — it names the project in it — so an uploaded image without a
 * caption gets none, rather than the name of a project that is not in it.
 *
 * Pure, and separate from the page, so the precedence rules are tested
 * without a database (tests/projects-hero.test.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

type Localized = { th: string; en: string; zh: string; ru: string };

export type ProjectsHeroOverrides = {
  imageUrl: string;
  imageCaption: string;
  eyebrow: Localized;
  title: Localized;
  subtitle: Localized;
};

export type ProjectsHeroFallback = {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** "background image" — the words after the caption's name. */
  creditSuffix: string;
  /** The first published project, or null when there is none. */
  project: { name: string; location: string; heroImageUrl: string | null } | null;
};

export type ProjectsHeroContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  image: { url: string; alt: string } | null;
  credit: { name: string; suffix: string } | null;
};

export function resolveProjectsHero(
  overrides: ProjectsHeroOverrides,
  locale: string,
  fallback: ProjectsHeroFallback,
): ProjectsHeroContent {
  const pick = (values: Localized, builtIn: string) =>
    values[locale as keyof Localized]?.trim() || builtIn;

  const title = pick(overrides.title, fallback.title);
  const caption = overrides.imageCaption.trim();
  const uploaded = overrides.imageUrl.trim();
  const project = fallback.project;

  let image: ProjectsHeroContent["image"] = null;
  let creditName = "";

  if (uploaded) {
    image = { url: uploaded, alt: caption || title };
    creditName = caption;
  } else if (project?.heroImageUrl) {
    image = { url: project.heroImageUrl, alt: `${project.name}, ${project.location}` };
    creditName = caption || project.name;
  }

  return {
    eyebrow: pick(overrides.eyebrow, fallback.eyebrow),
    title,
    subtitle: pick(overrides.subtitle, fallback.subtitle),
    image,
    credit: image && creditName ? { name: creditName, suffix: fallback.creditSuffix } : null,
  };
}
