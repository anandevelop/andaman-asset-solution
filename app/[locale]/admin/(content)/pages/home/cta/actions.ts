"use server";

/**
 * app/[locale]/admin/pages/home/cta/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Writes for the closing-CTA band: blocks, their per-locale words, and the
 * page → block assignment table. Read side is lib/site-cta.ts.
 *
 * Same shape as ../corporate/actions.ts — one translated field set per
 * save, the untranslated columns written every time — with three rules of
 * its own, all of them there to stop a save from quietly emptying the CTA
 * on pages nobody was looking at:
 *
 *   · at most one block is the default, enforced inside the transaction
 *     rather than by hoping two admins never save at once;
 *   · the default block cannot be deleted, because every page without a
 *     placement row of its own is relying on it;
 *   · a placement pointing at a block that no longer exists is deleted
 *     with it (onDelete: Cascade), returning those pages to the default
 *     instead of to nothing.
 *
 * Every write purges all four locale subtrees: this section is in the site
 * layout, so a changed word affects every public page at once.
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { getMessages } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { locales, type Locale } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { CTA_PATHS } from "@/lib/site-cta";
import {
  fieldErrors,
  PLACEMENT_DEFAULT,
  PLACEMENT_HIDDEN,
  siteCtaBlockSchema,
} from "@/lib/validations";

export type SiteCtaFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData) {
  const text = (key: string) => ((formData.get(key) as string | null) ?? "").trim();

  return {
    locale: text("locale") || "en",
    name: text("name"),
    isActive: formData.get("isActive") === "on",
    isDefault: formData.get("isDefault") === "on",
    sortOrder: text("sortOrder") || "0",
    backgroundImageUrl: text("backgroundImageUrl"),
    primaryKind: text("primaryKind") || "PAGE",
    primaryHref: text("primaryHref"),
    secondaryKind: text("secondaryKind") || "WHATSAPP",
    secondaryHref: text("secondaryHref"),
    eyebrow: text("eyebrow"),
    title: text("title"),
    subtitle: text("subtitle"),
    primaryLabel: text("primaryLabel"),
    secondaryLabel: text("secondaryLabel"),
  };
}

function revalidateCta(locale: string) {
  revalidatePath(`/${locale}/admin/pages/home/cta`);
  // In the site layout, so every page of every locale renders it.
  for (const target of locales) {
    revalidatePath(`/${target}`, "layout");
  }
}

/** Blank strings are how an HTML form says "not set"; the columns are
 *  nullable so a read can tell "no photograph" from "" without trimming. */
const orNull = (value: string) => (value.length > 0 ? value : null);

export async function createCtaBlock(
  locale: string,
  _previous: SiteCtaFormState,
  formData: FormData,
): Promise<SiteCtaFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = siteCtaBlockSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.siteCtaBlock.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      await tx.siteCtaBlock.create({
        data: {
          name: data.name,
          isActive: data.isActive,
          isDefault: data.isDefault,
          sortOrder: data.sortOrder,
          backgroundImageUrl: orNull(data.backgroundImageUrl),
          primaryKind: data.primaryKind,
          primaryHref: orNull(data.primaryHref),
          secondaryKind: data.secondaryKind,
          secondaryHref: orNull(data.secondaryHref),
          translations: {
            create: {
              locale: data.locale,
              eyebrow: orNull(data.eyebrow),
              title: data.title,
              subtitle: orNull(data.subtitle),
              primaryLabel: orNull(data.primaryLabel),
              secondaryLabel: orNull(data.secondaryLabel),
            },
          },
        },
      });
    });
  } catch (error) {
    console.error("[createCtaBlock]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCta(locale);
  return { ok: true, message: "SAVED" };
}

export async function updateCtaBlock(
  locale: string,
  id: string,
  _previous: SiteCtaFormState,
  formData: FormData,
): Promise<SiteCtaFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = siteCtaBlockSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.siteCtaBlock.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      await tx.siteCtaBlock.update({
        where: { id },
        data: {
          name: data.name,
          isActive: data.isActive,
          isDefault: data.isDefault,
          sortOrder: data.sortOrder,
          backgroundImageUrl: orNull(data.backgroundImageUrl),
          primaryKind: data.primaryKind,
          primaryHref: orNull(data.primaryHref),
          secondaryKind: data.secondaryKind,
          secondaryHref: orNull(data.secondaryHref),
          translations: {
            upsert: {
              where: { blockId_locale: { blockId: id, locale: data.locale } },
              update: {
                eyebrow: orNull(data.eyebrow),
                title: data.title,
                subtitle: orNull(data.subtitle),
                primaryLabel: orNull(data.primaryLabel),
                secondaryLabel: orNull(data.secondaryLabel),
              },
              create: {
                locale: data.locale,
                eyebrow: orNull(data.eyebrow),
                title: data.title,
                subtitle: orNull(data.subtitle),
                primaryLabel: orNull(data.primaryLabel),
                secondaryLabel: orNull(data.secondaryLabel),
              },
            },
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "SAVE_FAILED" };
    }
    console.error("[updateCtaBlock]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCta(locale);
  return { ok: true, message: "SAVED" };
}

export async function deleteCtaBlock(
  locale: string,
  id: string,
  _previous: SiteCtaFormState,
): Promise<SiteCtaFormState> {
  await requireAdminAction(Role.EDITOR);

  try {
    const block = await prisma.siteCtaBlock.findUnique({
      where: { id },
      select: { isDefault: true },
    });

    if (!block) return { ok: false, message: "SAVE_FAILED" };

    /* Every page without a placement row of its own falls back to the
       default. Deleting it would empty the CTA on all of them at once, and
       the admin would find out from the public site. */
    if (block.isDefault) return { ok: false, message: "DEFAULT_LOCKED" };

    await prisma.siteCtaBlock.delete({ where: { id } });
  } catch (error) {
    console.error("[deleteCtaBlock]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCta(locale);
  return { ok: true, message: "SAVED" };
}

/**
 * The whole page → block table in one save.
 *
 * One submit rather than a control per row: the rules that matter here are
 * about the set as a whole ("which pages show nothing", "which pages are
 * on the default"), and an admin moving three pages at once should not
 * have to watch three separate saves land.
 *
 * A row set back to "use the default" deletes its placement instead of
 * storing the default's id. That keeps one meaning per state — no row
 * means no decision was made — so a later change of default follows those
 * pages automatically instead of leaving them pinned to a block by a
 * choice nobody remembers making.
 */
export async function saveCtaPlacements(
  locale: string,
  _previous: SiteCtaFormState,
  formData: FormData,
): Promise<SiteCtaFormState> {
  await requireAdminAction(Role.EDITOR);

  const known = new Set(
    (await prisma.siteCtaBlock.findMany({ select: { id: true } })).map((block) => block.id),
  );

  const remove: string[] = [];
  const upsert: { path: string; blockId: string | null }[] = [];

  for (const path of CTA_PATHS) {
    const choice = ((formData.get(`path:${path}`) as string | null) ?? "").trim();

    if (choice === PLACEMENT_DEFAULT || choice === "") {
      remove.push(path);
      continue;
    }

    if (choice === PLACEMENT_HIDDEN) {
      upsert.push({ path, blockId: null });
      continue;
    }

    // An id that is not a real block would be a placement pointing at
    // nothing — treated as "no decision" rather than trusted.
    if (!known.has(choice)) {
      remove.push(path);
      continue;
    }

    upsert.push({ path, blockId: choice });
  }

  try {
    await prisma.$transaction([
      prisma.siteCtaPlacement.deleteMany({ where: { path: { in: remove } } }),
      ...upsert.map((row) =>
        prisma.siteCtaPlacement.upsert({
          where: { path: row.path },
          update: { blockId: row.blockId },
          create: row,
        }),
      ),
    ]);
  } catch (error) {
    console.error("[saveCtaPlacements]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCta(locale);
  return { ok: true, message: "SAVED" };
}

/**
 * Create the three blocks the site was using before any of this existed,
 * in all four languages, from the copy in messages/*.json.
 *
 * Offered instead of shipping seed rows in the migration for two reasons.
 * The words are still the live fallback while the table is empty (see
 * lib/site-cta.ts), so an install that never presses this button behaves
 * exactly as before rather than sitting on a half-configured table. And an
 * import is legible: an editor can see the same sentences appear, edit
 * them, and know that what they now change is what visitors read.
 *
 * Refuses when blocks already exist. This is a starting point, not a
 * reset — running it twice would silently duplicate every block.
 */
export async function importCtaFileCopy(locale: string): Promise<SiteCtaFormState> {
  await requireAdminAction(Role.EDITOR);

  try {
    if ((await prisma.siteCtaBlock.count()) > 0) return { ok: false, message: "NOT_EMPTY" };

    // Raw, unformatted messages: the projects headline is an ICU plural,
    // and a translator call would render it against a count instead of
    // handing back the source string the editor needs to keep editing.
    const messages = await Promise.all(
      locales.map(async (target) => [target, (await getMessages({ locale: target })) as any] as const),
    );

    const read = (path: string[]) =>
      messages.map(([target, bundle]) => {
        let node: any = bundle;
        for (const key of path) node = node?.[key];
        return [target as Locale, typeof node === "string" ? node : null] as const;
      });

    const home = {
      eyebrow: read(["home", "cta", "eyebrow"]),
      title: read(["home", "cta", "title"]),
      subtitle: read(["home", "cta", "subtitle"]),
      primary: read(["home", "cta", "primary"]),
      secondary: read(["home", "cta", "secondary"]),
    };

    const pick = (rows: ReturnType<typeof read>, target: string) =>
      rows.find(([candidate]) => candidate === target)?.[1] ?? null;

    /** One block: the shared eyebrow and button labels from home.cta, with
     *  the headline and standfirst taken from wherever this block's words
     *  live. */
    const buildTranslations = (titles: ReturnType<typeof read>, subtitles: ReturnType<typeof read>) =>
      locales
        .map((target) => ({
          locale: target,
          eyebrow: pick(home.eyebrow, target),
          title: pick(titles, target) ?? "",
          subtitle: pick(subtitles, target),
          primaryLabel: pick(home.primary, target),
          secondaryLabel: pick(home.secondary, target),
        }))
        .filter((row) => row.title.length > 0);

    await prisma.$transaction(async (tx) => {
      const shared = {
        primaryKind: "PAGE" as const,
        primaryHref: "/contact",
        secondaryKind: "WHATSAPP" as const,
        secondaryHref: null,
      };

      const general = await tx.siteCtaBlock.create({
        data: {
          name: "General",
          isDefault: true,
          sortOrder: 0,
          ...shared,
          translations: { create: buildTranslations(home.title, home.subtitle) },
        },
      });

      const projects = await tx.siteCtaBlock.create({
        data: {
          name: "Projects",
          sortOrder: 1,
          ...shared,
          translations: {
            create: buildTranslations(
              read(["projects", "cta", "title"]),
              read(["projects", "cta", "subtitle"]),
            ),
          },
        },
      });

      const about = await tx.siteCtaBlock.create({
        data: {
          name: "About",
          sortOrder: 2,
          ...shared,
          translations: {
            create: buildTranslations(
              read(["about", "cta", "title"]),
              read(["about", "cta", "subtitle"]),
            ),
          },
        },
      });

      await tx.siteCtaPlacement.createMany({
        data: [
          { path: "/projects", blockId: projects.id },
          { path: "/about", blockId: about.id },
          // No CTA on /contact: its primary button would link to the page
          // the visitor is already reading, under the form it sends them
          // to. Imported as a real decision so it survives editing.
          { path: "/contact", blockId: null },
        ],
        skipDuplicates: true,
      });

      return general;
    });
  } catch (error) {
    console.error("[importCtaFileCopy]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateCta(locale);
  return { ok: true, message: "SAVED" };
}
