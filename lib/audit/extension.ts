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
 * phone, so labelling those entries would quietly accumulate a second copy
 * of the contact database in a table with no retention story of its own.
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
const UNLABELLED_MODELS = new Set(["LeadInquiry", "EventRegistration"]);

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
          let existedBefore = false;
          if (operation === "upsert") {
            const where = (args as { where?: Record<string, unknown> }).where;
            if (where) {
              const found = await withoutAudit(() =>
                // Indexing a delegate by name: Prisma hands `model` in as a
                // string, and there is no typed way back to the delegate.
                (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[
                  model
                ].findUnique({ where, select: { id: true } }),
              ).catch(() => null);
              existedBefore = Boolean(found);
            }
          }

          const result = await query(args);

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
