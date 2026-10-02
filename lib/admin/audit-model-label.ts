/**
 * lib/admin/audit-model-label.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the activity trail calls a record: "ห้องในแปลน (คำแปล)", not
 * "FloorPlanRoomTranslation".
 *
 * AuditLog.model is the Prisma model name, which is right for filtering
 * and for the edit links, and was shown as it is — so the dashboard's
 * "recent edits" read "anan.develop สร้าง FloorPlanRoomTranslation". The
 * label comes from messages (admin.auditModels) where one exists; a
 * `…Translation` model is its parent's label plus "(translation)"; and
 * anything new falls back to the name split into words, which is at least
 * readable until somebody adds its label.
 *
 * Pure: the page passes the labels in.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type AuditModelLabels = Record<string, string> & { translationSuffix: string };

/** "FloorPlanRoom" → "Floor plan room". */
export function splitModelName(model: string): string {
  const words = model.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export function auditModelLabel(model: string, labels: AuditModelLabels): string {
  if (labels[model]) return labels[model];
  const base = model.endsWith("Translation") ? model.slice(0, -"Translation".length) : null;
  if (base) return `${labels[base] ?? splitModelName(base)} ${labels.translationSuffix}`;
  return splitModelName(model);
}
