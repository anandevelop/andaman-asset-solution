/**
 * lib/audit/extension.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Writes the audit trail, by watching Prisma rather than by being called.
 *
 * Every create, update and delete an administrator makes passes through
 * here and leaves a row in AuditLog. The alternative — a recordAudit()
 * call at each of the fifty-odd server actions — was rejected because the
 * trail's whole value is completeness. Fifty call sites is fifty chances
 * to forget, the forgotten one is invisible until someone needs it, and a
 * missing entry reads as "nobody did this" rather than "this was not
 * logged". Watching the layer every write already goes through cannot be
 * forgotten by a future action.
 *
 * Only admin-originated writes are recorded. The actor comes from
 * lib/audit/context.ts, which the admin guards populate; a lead submitted
 * from the public site, an RSVP, or the sign-in path stamping totpLastStep
 * all run with no actor and are skipped. This table answers "which
 * administrator changed this", not "what has ever been written".
 *
 * What is stored is names, not contents: which fields an operation set,
 * never what it set them to. The one exception is recordLabel, a single
 * readable value — a slug or a title — kept because a deletion is the
 * entry someone will most want to read and the row it names will be gone.
 *
 * That exception is switched off for the models holding customer data.
 * Every readable field on a lead or an RSVP is the person's name, email or
 * phone (and a LeadNote's body is a free-text call log about that same
 * person), so labelling those entries would quietly accumulate a second
 * copy of the contact database in a table with no retention story of its
 * own.
 * Those entries carry recordId instead, which finds the row while it
 * exists and identifies it in the first table's own records afterwards.
 * ─────────────────────────────────────────────────────────────────────────
 */

/*
  No `import "server-only"` here, and that absence is deliberate.

  lib/prisma.ts imports this file, and fifty-eight modules import
  lib/prisma. Adding the marker put `server-only` into all of their graphs,
  and `server-only` is a module whose entire job is to throw when it is
  evaluated outside a server context. Next's build workers evaluate modules
  in more than one context: one of them hit the throw, the worker died, and
  the artefacts for whatever page it was building went missing. That
  surfaced as `Cannot find module for page: /_document`, a missing
  `.nft.json`, or a missing chunk — a different file every run, never a
  compile error, and the build never failing the same way twice.

  The protection is not lost, only moved: nothing imports this module
  except lib/prisma.ts, and every entry point that reaches it —
  lib/admin/guard.ts, the server actions, the route handlers — carries the
  marker itself.
*/
import { Prisma, type PrismaClient } from "@prisma/client";
import { getAuditActor, withoutAudit } from "@/lib/audit/context";
import { redirectOnRename } from "@/lib/redirect-on-rename";
import { reportError } from "@/lib/sentry";

/** Operations that change data. Reads are not audited. */
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * Models whose every readable field is somebody's personal data.
 *
 * Their entries get no label. See the header: the point of the audit table
 * is who changed what, and it can say that with an id.
 */
const UNLABELLED_MODELS = new Set(["LeadInquiry", "EventRegistration", "LeadNote"]);

/**
 * Fields tried, in order, for a human-readable name of the affected row.
 *
 * Stored at write time rather than resolved when the page renders: the row
 * may be gone by then, and a deletion is exactly the entry someone will be
 * reading.
 */
const LABEL_FIELDS = [
  "slug",
  "title",
  // The deprecated EN/TH column pairs are still the only name many models
  // carry — Award has titleEn and no title at all, so leaving these out
  // labelled every award entry with nothing.
  "titleEn",
  "name",
  "nameEn",
  "email",
  "question",
  "questionEn",
];

export function labelFrom(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;

  const record = row as Record<string, unknown>;
  for (const field of LABEL_FIELDS) {
    const value = record[field];
    if (typeof value === "string" && value.trim() !== "") return value.slice(0, 200);
  }
  return undefined;
}

function idFrom(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const id = (row as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * The field names an operation set.
 *
 * `data` may be an array (createMany) or carry nested relation writes; only
 * the top-level keys are taken, which is the level the reader cares about
 * — "translations were touched", not the shape of the upsert.
 */
export function changedFieldsFrom(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];

  const data = (args as Record<string, unknown>).data;
  if (!data) return [];

  const source = Array.isArray(data) ? data[0] : data;
  if (!source || typeof source !== "object") return [];

  return Object.keys(source as Record<string, unknown>).sort();
}


/**
 * Longest value kept in an audit entry. A project description runs to
 * thousands of characters, and storing two copies of every one of them on
 * every save would grow this table faster than the changes it records are
 * worth. Longer values are truncated with a marker, which is enough to see
 * *that* the copy changed; the revert path refuses to use a truncated
 * value rather than writing a clipped paragraph back onto the site.
 */
export const MAX_AUDIT_VALUE_CHARS = 2000;

export const TRUNCATION_MARKER = "…[truncated]";

export type AuditChange = { before: unknown; after: unknown };

function shrink(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_AUDIT_VALUE_CHARS) {
    return value.slice(0, MAX_AUDIT_VALUE_CHARS) + TRUNCATION_MARKER;
  }
  // Dates and Decimals do not survive JSON on their own terms; store the
  // string form so the diff panel has something to print and the revert
  // path something Prisma can coerce back.
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toString" in value && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto && proto.constructor && proto.constructor.name === "Decimal") return String(value);
  }
  return value;
}

/** Same value, for the purpose of "is this worth recording". */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // Arrays and nested writes: a structural compare is close enough, and
  // cheaper to reason about than a deep walk.
  try {
    return JSON.stringify(shrink(a)) === JSON.stringify(shrink(b));
  } catch {
    return false;
  }
}

/**
 * The fields that genuinely changed, with what they went from and to.
 *
 * `before` is the row as it was read just before the write; `after` is
 * what the write returned. A field the operation set to the value it
 * already had is left out — see AuditLog.changes in schema.prisma for why
 * that matters.
 */
export function changesBetween(
  fields: string[],
  before: Record<string, unknown> | null,
  after: unknown,
): Record<string, AuditChange> | null {
  if (!before || !after || typeof after !== "object") return null;

  const next = after as Record<string, unknown>;
  const changes: Record<string, AuditChange> = {};

  for (const field of fields) {
    // Relation writes ({ translations: { upsert: ... } }) have no
    // comparable scalar on either side; changedFields still names them.
    if (!(field in next)) continue;
    if (sameValue(before[field], next[field])) continue;
    changes[field] = { before: shrink(before[field]), after: shrink(next[field]) };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/** "upsert" is create or update depending on how it landed; the rest map straight through. */
export function normaliseAction(operation: string, existedBefore: boolean): string {
  if (operation === "upsert") return existedBefore ? "update" : "create";
  if (operation === "createMany") return "create";
  if (operation === "updateMany") return "update";
  if (operation === "deleteMany") return "delete";
  return operation;
}

/**
 * Whether this operation leaves a trail.
 *
 * Three ways out, each deliberate: no actor means it was not an
 * administrator (a public lead, an RSVP, the sign-in path stamping
 * totpLastStep); AuditLog itself would recurse; and reads are not
 * accountability questions.
 */
export function shouldAudit(
  model: string | undefined,
  operation: string,
  actor: { id: string } | undefined,
): actor is { id: string } {
  if (!actor || !model) return false;
  if (model === "AuditLog") return false;
  return WRITE_OPERATIONS.has(operation);
}

/**
 * @param base an un-extended client. The audit insert must not pass back
 *   through this extension, or writing the trail would try to log itself.
 */
export function auditExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: "audit-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const actor = getAuditActor();

          if (!shouldAudit(model, operation, actor)) {
            return query(args);
          }

          /*
            An upsert has to be classified before it runs — afterwards
            there is no way to tell which half happened. One extra read,
            only on upserts by an administrator.
          */
          /*
            The row as it stands, read before the write so the entry can
            say what each field changed *from*.

            One extra read per admin update — the price of a history that
            can be reverted rather than merely listed. Skipped entirely for
            the customer-data models (their values are never stored, see
            AuditLog.changes) and for creates and bulk operations, where
            there is no single prior row to read.
          */
          let beforeRow: Record<string, unknown> | null = null;
          const capturesValues =
            !UNLABELLED_MODELS.has(model) && (operation === "update" || operation === "upsert");

          if (capturesValues) {
            const where = (args as { where?: Record<string, unknown> }).where;
            if (where) {
              beforeRow = (await withoutAudit(() =>
                (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
                  model
                ].findUnique({ where }),
              ).catch(() => null)) as Record<string, unknown> | null;
            }
          }

          let existedBefore = false;
          if (operation === "upsert") {
            // Already read above when this model captures values; only pay
            // for a second lookup when it does not.
            if (beforeRow !== null) {
              existedBefore = true;
            } else if (capturesValues) {
              existedBefore = false;
            } else {
            const where = (args as { where?: Record<string, unknown> }).where;
            if (where) {
              const found = await withoutAudit(() =>
                // Indexing a delegate by name: Prisma hands `model` in as a
                // string, and there is no typed way back to the delegate.
                (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
                  model
                ].findUnique({
                  where,
                  /*
                    No `select`.

                    This asked for `{ id: true }`, which is a validation
                    error on any model whose primary key is not called
                    `id` — SiteSetting's is `key`. The .catch() below then
                    swallowed it, so every settings save was recorded as a
                    CREATE no matter how many times the row had been
                    edited, and printed "Unknown field `id`" to stderr on
                    the way past. Only existence is needed here, and every
                    model can answer that without being told which column
                    to return.
                  */
                }),
              ).catch(() => null);
              existedBefore = Boolean(found);
            }
            }
          }

          const result = await query(args);

          /*
            A renamed slug leaves a 301 behind it.

            Here rather than in the four edit forms because the prior row
            is already in hand two blocks up — read for the audit trail's
            before/after — and because this is the one place every write
            passes through. See lib/redirect-on-rename.ts for what it does
            with the two slugs and why it is not simply an insert.

            Awaited, not fired and forgotten: the admin is about to be
            redirected to a list that shows the redirect, and a rename that
            reports success before its cover exists is a rename somebody
            will check and not find.
          */
          if (capturesValues) {
            await withoutAudit(() => redirectOnRename(base, model, beforeRow, result));
          }

          /*
            Logging never fails the operation it describes.

            The change is already committed by this point; throwing here
            would report a successful edit as an error and invite the
            administrator to make it twice. A lost entry is bad — it is the
            one thing this table is for — so it goes to Sentry rather than
            only to a container's stdout, where nobody would find it.
          */
          try {
            const bulkCount =
              typeof result === "object" && result !== null && "count" in result
                ? (result as { count: number }).count
                : undefined;

            await withoutAudit(() =>
              base.auditLog.create({
                data: {
                  actorId: actor.id,
                  actorEmail: actor.email,
                  actorRole: actor.role,
                  action: normaliseAction(operation, existedBefore),
                  model,
                  recordId: idFrom(result),
                  recordLabel: UNLABELLED_MODELS.has(model) ? null : labelFrom(result),
                  changedFields: changedFieldsFrom(args),
                  changes: capturesValues
                    ? (changesBetween(changedFieldsFrom(args), beforeRow, result) as
                        | Prisma.InputJsonValue
                        | undefined) ?? Prisma.DbNull
                    : Prisma.DbNull,
                  count: bulkCount,
                },
              }),
            );
          } catch (error) {
            console.error("[audit] failed to record an admin change", error);
            reportError(error, {
              tags: { area: "audit" },
              extra: { model, operation, actorId: actor.id },
            });
          }

          return result;
        },
      },
    },
  });
}
