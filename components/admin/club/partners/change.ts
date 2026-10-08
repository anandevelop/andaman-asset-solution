/**
 * components/admin/club/partners/change.ts — "สิทธิ์ ค่าเริ่มต้น (ลด 20%) →
 * ลด 15%" (the mockup's chgDesc), shared by the approvals tab and the unit
 * drawer. Takes a plain translator so server and client callers both fit.
 */

export type Translate = (key: string, values?: Record<string, string | number>) => string;
export type ChangeState = { hidden: boolean; pct: number | null };

export function pctText(t: Translate, pct: number | null, defaultPct: number | null): string {
  if (pct !== null) return t("change.pctValue", { pct });
  return t("change.default", { value: defaultPct ? t("change.pctValue", { pct: defaultPct }) : t("unit.comingSoon") });
}

export function describeChange(t: Translate, from: ChangeState, to: ChangeState, defaultPct: number | null): string {
  const parts: string[] = [];
  if (from.hidden !== to.hidden) parts.push(t(to.hidden ? "change.hide" : "change.show"));
  if (from.pct !== to.pct) {
    parts.push(t("change.pct", { from: pctText(t, from.pct, defaultPct), to: pctText(t, to.pct, defaultPct) }));
  }
  return parts.join(" · ") || t("change.none");
}
