/**
 * lib/redirect-on-rename.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Rename a slug once and every old link dies instantly — from Google, and
 * from the brochures already printed."
 *
 * This file is the answer to that. When an administrator changes the slug
 * of a project, article, event or e-brochure, a 301 covering the old path
 * is written for them, and they are told about it afterwards rather than
 * asked about it beforehand: the moment to decide whether to keep an old
 * URL alive is not while renaming something, and the honest default is
 * yes, because the alternative silently discards whatever link equity and
 * printed material pointed at it.
 *
 * WIRED INTO THE PRISMA EXTENSION, NOT INTO THE FOUR EDIT FORMS
 *
 * lib/audit/extension.ts already reads the row before every admin update
 * so the audit trail can say what a field changed *from*. That prior value
 * is exactly what this needs, and the extension is the one place every
 * write goes through — the same argument its own header makes for logging.
 * Four call sites would be four chances for the fifth one to forget.
 *
 * TWO THINGS THAT ARE EASY TO GET WRONG, AND ARE HANDLED HERE
 *
 * 1. Chains. Rename a→b, then b→c, and a naive implementation leaves
 *    /a → /b → /c. Browsers follow it; Google penalises the hop and some
 *    older link checkers stop at the first. So every row already pointing
 *    at the old path is re-pointed at the new one in the same breath.
 *
 * 2. Loops. Rename a→b and then back b→a, and the row written by the first
 *    rename would send /a to /b while /b no longer exists — a redirect to
 *    a 404, or worse a cycle. A row whose fromPath is the *new* slug is
 *    therefore deleted: that URL is live again and must answer for itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { RedirectSource, type PrismaClient } from "@prisma/client";

/**
 * Which models own a public URL, and the path their slug sits under.
 *
 * Keyed by Prisma model name because that is what the extension hands in.
 * A model missing from here is a model whose slug is not part of any
 * public URL, and renaming it breaks nothing outside the admin.
 */
const SLUG_PATHS: Record<string, string> = {
  Project: "/projects",
  NewsArticle: "/news",
  Event: "/events",
  EBrochure: "/e-brochure",
};

/** Locale-relative, matching how Redirect rows are stored — one row covers
 *  all four language prefixes, which is why none appears here. */
function pathFor(model: string, slug: string): string | null {
  const prefix = SLUG_PATHS[model];
  return prefix ? `${prefix}/${slug}` : null;
}

const isSlug = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Called after an admin update has committed. `before` and `after` are the
 * whole rows; everything is read defensively because they arrive from the
 * extension as untyped records.
 *
 * `client` is the un-extended Prisma client the extension already holds,
 * so the writes below do not recurse back through the audit extension and
 * log themselves as administrator edits — the administrator renamed a
 * project, they did not create a redirect.
 *
 * Never throws. A redirect that could not be written is worth reporting,
 * but not worth failing a rename that has already happened.
 */
export async function redirectOnRename(
  client: PrismaClient,
  model: string,
  before: Record<string, unknown> | null,
  after: unknown,
): Promise<void> {
  if (!before || typeof after !== "object" || after === null) return;

  const oldSlug = (before as Record<string, unknown>).slug;
  const newSlug = (after as Record<string, unknown>).slug;

  if (!isSlug(oldSlug) || !isSlug(newSlug) || oldSlug === newSlug) return;

  const fromPath = pathFor(model, oldSlug);
  const toPath = pathFor(model, newSlug);
  if (!fromPath || !toPath) return;

  try {
    await client.$transaction([
      // (2) above — the new URL is live again, so nothing may redirect off it.
      client.redirect.deleteMany({ where: { fromPath: toPath } }),

      // (1) above — anything that pointed at the old path follows it.
      client.redirect.updateMany({ where: { toPath: fromPath }, data: { toPath } }),

      client.redirect.upsert({
        where: { fromPath },
        create: {
          fromPath,
          toPath,
          statusCode: 301,
          source: RedirectSource.AUTO_SLUG,
        },
        /*
          An update, not a skip: /projects/a may already redirect somewhere
          from an earlier rename, and after a→b→a→b it has to point at
          wherever the record actually lives now. `source` is reasserted
          because a row that started life as a hand-typed vanity URL and
          has now been overtaken by a rename is, from here on, maintained
          by the rename.
        */
        update: {
          toPath,
          statusCode: 301,
          isActive: true,
          expiresAt: null,
          source: RedirectSource.AUTO_SLUG,
        },
      }),

      // The old path is covered now, so it is no longer an open 404.
      client.notFoundHit.deleteMany({ where: { path: fromPath } }),
    ]);
  } catch (error) {
    console.error("[redirect-on-rename] failed to cover a renamed slug", {
      model,
      fromPath,
      toPath,
      error,
    });
  }
}
