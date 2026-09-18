"use server";

/**
 * app/[locale]/admin/seo/urls/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Everything this screen can change: the redirect table, and whether a 404
 * is still on the worklist.
 *
 * ADMIN and above, as before — a wrong redirect can send a whole section
 * of the site somewhere else, and unlike a bad paragraph it does it to
 * search engines too, quietly, for as long as nobody notices.
 *
 * THE GUARD AGAINST LOOPS IS HERE, NOT IN THE UI
 *
 * A redirect whose target is itself covered by another redirect is a
 * chain; one that eventually comes back to where it started is a loop, and
 * a loop is a page that never loads. Both are checked below, on the saved
 * table plus the row about to be written, because the check has to hold
 * whichever way the row got here — the form, the one-click button on a
 * 404, or a CSV import of two hundred rows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, RedirectSource, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
// The units importer's parser, unchanged — same job, same files out of
// Excel, and a second CSV reader in this codebase is a second set of
// edge cases to get wrong. See lib/csv.ts.
import { parseCsv } from "@/lib/csv";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** A path, as stored: locale-relative, leading slash, no host, no query. */
const pathField = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith("/"), { message: "MUST_START_WITH_SLASH" })
  .refine((value) => !/^\/\//.test(value), { message: "PROTOCOL_RELATIVE" });

/** The target may also be an absolute URL — a campaign pointing at a
 *  partner's site is a legitimate redirect, just not an internal one. */
const targetField = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "MUST_BE_PATH_OR_URL",
  });

const redirectInput = z.object({
  fromPath: pathField,
  toPath: targetField,
  statusCode: z.union([z.literal(301), z.literal(302)]),
  isActive: z.boolean(),
  note: z.string().trim().max(500).nullable(),
  /** ISO date (yyyy-mm-dd) or null. */
  expiresAt: z.string().trim().max(40).nullable(),
});

function revalidateUrls(locale: string) {
  revalidatePath(`/${locale}/admin/seo/urls`);
  revalidatePath(`/${locale}/admin/seo`);
}

function parseExpiry(value: string | null): Date | null | undefined {
  if (value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Walk the chain from `toPath` and report the first problem.
 *
 * `ignoreId` is the row being edited, which must be left out of the saved
 * set or every edit would find itself.
 */
async function chainProblem(
  fromPath: string,
  toPath: string,
  ignoreId: string | null,
): Promise<"LOOP" | "CHAIN" | null> {
  if (fromPath === toPath) return "LOOP";
  if (!toPath.startsWith("/")) return null;

  const rows = await prisma.redirect.findMany({
    where: { isActive: true, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { fromPath: true, toPath: true },
  });

  const table = new Map(rows.map((row) => [row.fromPath, row.toPath]));
  table.set(fromPath, toPath);

  const seen = new Set<string>([fromPath]);
  let current = toPath;

  // Ten is far past anything legitimate; a longer walk means the table has
  // grown a structure nobody intended.
  for (let step = 0; step < 10; step += 1) {
    if (seen.has(current)) return "LOOP";
    const next = table.get(current);
    if (!next) return step === 0 ? null : "CHAIN";
    seen.add(current);
    current = next;
  }

  return "LOOP";
}

async function writeRedirect(
  locale: string,
  input: unknown,
  id: string | null,
): Promise<ActionResult> {
  const session = await requireAdminAction(Role.ADMIN);

  const parsed = redirectInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const { fromPath, toPath, statusCode, isActive, note } = parsed.data;
  const expiresAt = parseExpiry(parsed.data.expiresAt);
  if (expiresAt === undefined) return { ok: false, error: "INVALID_DATE" };

  const problem = await chainProblem(fromPath, toPath, id);
  if (problem) return { ok: false, error: problem };

  const data = {
    fromPath,
    toPath,
    statusCode,
    isActive,
    note: note || null,
    expiresAt,
    source: RedirectSource.MANUAL,
  };

  try {
    if (id) {
      await prisma.redirect.update({ where: { id }, data });
    } else {
      await prisma.redirect.create({ data: { ...data, createdBy: session.id } });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "DUPLICATE" };
    }
    return { ok: false, error: id ? "UPDATE_FAILED" : "CREATE_FAILED" };
  }

  // The path is covered now, so it is no longer an open 404.
  await prisma.notFoundHit.deleteMany({ where: { path: fromPath } });

  revalidateUrls(locale);
  return { ok: true };
}

export async function createRedirect(locale: string, input: unknown): Promise<ActionResult> {
  return writeRedirect(locale, input, null);
}

export async function updateRedirect(
  locale: string,
  id: string,
  input: unknown,
): Promise<ActionResult> {
  return writeRedirect(locale, input, id);
}

export async function setRedirectActive(
  locale: string,
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    await prisma.redirect.update({ where: { id }, data: { isActive } });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateUrls(locale);
  return { ok: true };
}

export async function deleteRedirect(locale: string, id: string): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    await prisma.redirect.delete({ where: { id } });
  } catch {
    return { ok: false, error: "DELETE_FAILED" };
  }

  revalidateUrls(locale);
  return { ok: true };
}

/**
 * The one-click button on a 404 row: cover this path, starting now.
 *
 * Separate from createRedirect because the path is not typed and must not
 * be editable in flight — it is the exact string people are requesting,
 * and re-typing it is how a fix ends up covering a path nobody visits.
 */
export async function redirectNotFound(
  locale: string,
  notFoundId: string,
  toPath: string,
): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  const hit = await prisma.notFoundHit.findUnique({
    where: { id: notFoundId },
    select: { path: true },
  });
  if (!hit) return { ok: false, error: "NOT_FOUND" };

  return writeRedirect(
    locale,
    {
      fromPath: hit.path,
      toPath,
      statusCode: 301,
      isActive: true,
      note: null,
      expiresAt: null,
    },
    null,
  );
}

/**
 * Take a 404 off the worklist without pretending it stopped happening.
 *
 * The row stays and keeps counting — see NotFoundHit.hiddenAt. Deleting
 * it, which this screen used to do, only worked until the next request for
 * the same path recreated it.
 */
export async function hideNotFound(locale: string, id: string): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    await prisma.notFoundHit.update({ where: { id }, data: { hiddenAt: new Date() } });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateUrls(locale);
  return { ok: true };
}

export async function unhideAllNotFound(locale: string): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    await prisma.notFoundHit.updateMany({
      where: { hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateUrls(locale);
  return { ok: true };
}

/**
 * CSV import. Two columns are required (from, to); status, note and an
 * expiry date are optional.
 *
 * Nothing is written until every row has been checked, so a file with a
 * loop in row 40 does not leave rows 1–39 applied. The report says which
 * lines were skipped and why, because a silent "imported 37 of 200" is
 * how a redirect nobody notices goes missing.
 *
 * CHAINS ARE FLATTENED, NOT REJECTED
 *
 * The form refuses a redirect whose target is itself redirected, because
 * somebody typing one row can simply type the real destination. A file is
 * different: an export from an old site is full of chains that accumulated
 * over years, and refusing them would refuse the migration this button
 * exists for. So a chained target is followed to its end and the row is
 * saved pointing there — the same destination, one hop instead of three —
 * and the count is reported so nobody has to wonder why the saved row does
 * not match the file.
 */
const MAX_IMPORT_ROWS = 500;

export type ImportReport = {
  ok: true;
  created: number;
  updated: number;
  /** Rows whose target was itself redirected and has been resolved to the
   *  end of the chain. See the note in the importer. */
  flattened: number;
  skipped: { line: number; from: string; reason: string }[];
};

export async function importRedirectsCsv(
  locale: string,
  csv: string,
): Promise<ImportReport | { ok: false; error: string }> {
  const session = await requireAdminAction(Role.ADMIN);

  const parsedRows = parseCsv(csv).filter((cells) => cells.some((cell) => cell.trim().length > 0));

  if (parsedRows.length === 0) return { ok: false, error: "EMPTY_FILE" };
  if (parsedRows.length > MAX_IMPORT_ROWS + 1) return { ok: false, error: "TOO_MANY_ROWS" };

  // A header row is optional; it is recognised, not required.
  const startsWithHeader = /^from$/i.test((parsedRows[0][0] ?? "").trim());
  const rows = startsWithHeader ? parsedRows.slice(1) : parsedRows;

  const existing = await prisma.redirect.findMany({
    select: { id: true, fromPath: true, toPath: true, isActive: true },
  });
  const byFrom = new Map(existing.map((row) => [row.fromPath, row]));

  // Built up as the file is read so a chain *within the file* is caught
  // too, not only a chain against what is already saved.
  const table = new Map(existing.filter((row) => row.isActive).map((r) => [r.fromPath, r.toPath]));

  const skipped: ImportReport["skipped"] = [];
  let flattened = 0;
  const writes: { fromPath: string; toPath: string; statusCode: number; note: string | null }[] = [];

  rows.forEach((cells, index) => {
    const lineNumber = index + (startsWithHeader ? 2 : 1);

    const from = (cells[0] ?? "").trim();
    const to = (cells[1] ?? "").trim();
    const statusRaw = (cells[2] ?? "").trim();
    const note = (cells[3] ?? "").trim();

    const parsed = redirectInput.safeParse({
      fromPath: from,
      toPath: to,
      statusCode: statusRaw === "302" ? 302 : 301,
      isActive: true,
      note: note || null,
      expiresAt: null,
    });

    if (!parsed.success) {
      skipped.push({ line: lineNumber, from, reason: "INVALID" });
      return;
    }

    if (from === to) {
      skipped.push({ line: lineNumber, from, reason: "LOOP" });
      return;
    }

    // Follow this row's target through the table as it stands, so the row
    // is saved pointing at the end of the chain rather than at the middle.
    let current = to;
    let looped = false;
    const seen = new Set([from]);
    for (let step = 0; step < 10; step += 1) {
      if (seen.has(current)) {
        looped = true;
        break;
      }
      seen.add(current);
      const next = table.get(current);
      if (!next) break;
      current = next;
    }

    if (looped) {
      skipped.push({ line: lineNumber, from, reason: "LOOP" });
      return;
    }

    if (current !== to) flattened += 1;

    table.set(from, current);
    writes.push({
      fromPath: from,
      toPath: current,
      statusCode: parsed.data.statusCode,
      note: parsed.data.note,
    });
  });

  let created = 0;
  let updated = 0;

  try {
    await prisma.$transaction(
      writes.map((row) => {
        const exists = byFrom.has(row.fromPath);
        if (exists) updated += 1;
        else created += 1;

        return prisma.redirect.upsert({
          where: { fromPath: row.fromPath },
          create: { ...row, isActive: true, source: RedirectSource.MANUAL, createdBy: session.id },
          update: { ...row, isActive: true, source: RedirectSource.MANUAL },
        });
      }),
    );

    await prisma.notFoundHit.deleteMany({
      where: { path: { in: writes.map((row) => row.fromPath) } },
    });
  } catch {
    return { ok: false, error: "IMPORT_FAILED" };
  }

  revalidateUrls(locale);
  return { ok: true, created, updated, flattened, skipped };
}
