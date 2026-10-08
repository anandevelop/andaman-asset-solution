"use client";

/**
 * components/admin/club/partners/UnitBenefitsList.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The editing half of UnitBenefits: per partner a "ลด [ ] %" box capped
 * at the partner's default (placeholder = default), a reset, an on/off
 * switch for this house, badges, and the pending bar with approve /
 * reject / cancel. Every edit sends the whole {hidden, pct} pair to
 * changeUnitBenefit; the server re-checks the cap and decides
 * live-vs-pending by role.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Clock, Gift, Home, RotateCcw } from "lucide-react";
import { checkOverridePct, effectivePct, formatDiscount, parsePct } from "@/lib/club/benefits";
import {
  approveAllRequests,
  cancelRequest,
  changeUnitBenefit,
  decideRequest,
  resetUnit,
} from "@/app/[locale]/admin/(club)/partners/actions";
import { describeChange, type Translate } from "./change";
import { ValidityLine, type PartnerRow } from "./PartnerTable";
import { CategoryIcon, Note, PartnerAvatar, PctField, Switch, fmtDateTime } from "./ui";
import { useFlash } from "./Flash";

type State = { hidden: boolean; pct: number | null };

export type UnitBenefitItem = {
  partnerId: string;
  name: string;
  category: string;
  area: string | null;
  coverImage: string | null;
  defaultPct: number | null;
  note: string | null;
  live: State;
  validity: PartnerRow["validity"];
  request: { id: string; to: State; by: string; at: string; own: boolean } | null;
};

type Result = { ok: boolean; error?: string; cap?: number; result?: string; count?: number; failed?: number };

export default function UnitBenefitsList({
  locale,
  unitId,
  projectCode,
  items,
  hiddenForProject,
  canApprove,
  lastApplied,
}: {
  locale: string;
  unitId: string;
  projectCode: string;
  items: UnitBenefitItem[];
  hiddenForProject: number;
  canApprove: boolean;
  lastApplied: string | null;
}) {
  const t = useTranslations("clubPartners");
  const tr: Translate = (key, values) => t(key as never, values as never);
  const router = useRouter();
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);

  const errorText = (result: Result) => {
    const key = `errors.${result.error ?? "generic"}`;
    return t.has(key) ? t(key as never, { cap: result.cap ?? 0 } as never) : t("errors.generic");
  };

  const run = (task: () => Promise<Result>, done?: (r: Result) => string) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        show(errorText(result), "error");
        return;
      }
      setRejecting(null);
      show(done ? done(result) : t(`unit.${result.result ?? "live"}` as never));
      router.refresh();
    });

  const change = (item: UnitBenefitItem, to: State) =>
    run(() => changeUnitBenefit(locale, unitId, item.partnerId, to.hidden, to.pct));

  const shown = items.filter((item) => !item.live.hidden).length;
  const pendingCount = items.filter((item) => item.request).length;
  const anyCustom = items.some((item) => item.live.hidden || item.live.pct !== null || item.request);

  return (
    <section aria-label={t("unit.title")}>
      {flash}
      <h5 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted">
        {t("unit.title")}
        <span className="font-medium normal-case tracking-normal">{t("unit.count", { shown, total: items.length })}</span>
        {anyCustom && (
          <button
            type="button"
            className="admin-btn-quiet admin-btn-sm ml-auto normal-case tracking-normal"
            disabled={busy}
            onClick={() =>
              run(
                () => resetUnit(locale, unitId),
                () => (canApprove ? t("unit.resetLive") : t("unit.resetPending")),
              )
            }
          >
            <RotateCcw size={13} aria-hidden /> {t("unit.reset")}
          </button>
        )}
      </h5>

      <div className="mb-2">
        <Note tone={canApprove ? "info" : "warning"} icon={canApprove ? <Gift size={14} /> : <Clock size={14} />}>
          {canApprove ? t("unit.noteApprover") : t("unit.noteRequester")} · {t("unit.noteRule")}
          {lastApplied && (
            <>
              <br />
              <b>{t("unit.lastApplied")}</b> {lastApplied}
            </>
          )}
        </Note>
      </div>

      {pendingCount > 0 && (
        <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-adm-warning-bg px-2.5 py-2 text-[12.5px] font-semibold text-adm-warning">
          <Clock size={14} aria-hidden /> {t("unit.pendingBar", { count: pendingCount })}
          {canApprove && items.some((item) => item.request && !item.request.own) && (
            <button
              type="button"
              className="admin-btn admin-btn-sm ml-auto"
              disabled={busy}
              onClick={() =>
                run(
                  () => approveAllRequests(locale, unitId),
                  (r) =>
                    r.failed
                      ? t("approvals.approvedAllFailed", { count: r.count ?? 0, failed: r.failed })
                      : t("approvals.approvedAll", { count: r.count ?? 0 }),
                )
              }
            >
              <Check size={13} aria-hidden /> {t("unit.approveUnit")}
            </button>
          )}
        </div>
      )}

      {hiddenForProject > 0 && (
        <div className="mb-1.5 flex items-center gap-1 text-[11.5px] text-adm-muted">
          <Home size={11} aria-hidden /> {t("unit.notForProject", { count: hiddenForProject, project: projectCode })}
        </div>
      )}

      {items.length === 0 && <p className="py-3 text-sm text-adm-muted">{t("unit.empty")}</p>}

      {items.map((item, index) => {
        const header =
          index === 0 || items[index - 1].category !== item.category ? (
            <div className="mb-0.5 mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-adm-muted">
              <CategoryIcon category={item.category} size={12} /> {t(`cat.${item.category}` as never)}
            </div>
          ) : null;
        return (
          <Fragment key={item.partnerId}>
            {header}
            <BenefitRow
              key={`${(item.request?.to ?? item.live).hidden}:${(item.request?.to ?? item.live).pct ?? ""}`}
              item={item}
              locale={locale}
              busy={busy}
              canApprove={canApprove}
              rejecting={rejecting === item.request?.id}
              onReject={() => setRejecting(item.request?.id ?? null)}
              onRejectBack={() => setRejecting(null)}
              onChange={(to) => change(item, to)}
              onInvalid={(message) => show(message, "error")}
              onDecide={(approve, reason) =>
                item.request &&
                run(
                  () => decideRequest(locale, item.request!.id, approve, reason),
                  () => (approve ? t("approvals.approvedToast") : t("approvals.rejectedToast")),
                )
              }
              onCancel={() => item.request && run(() => cancelRequest(locale, item.request!.id), () => t("approvals.cancelledToast"))}
              tr={tr}
            />
          </Fragment>
        );
      })}
    </section>
  );
}

function BenefitRow({
  item,
  locale,
  busy,
  canApprove,
  rejecting,
  onReject,
  onRejectBack,
  onChange,
  onInvalid,
  onDecide,
  onCancel,
  tr,
}: {
  item: UnitBenefitItem;
  locale: string;
  busy: boolean;
  canApprove: boolean;
  rejecting: boolean;
  onReject: () => void;
  onRejectBack: () => void;
  onChange: (to: State) => void;
  onInvalid: (message: string) => void;
  onDecide: (approve: boolean, reason?: string) => void;
  onCancel: () => void;
  tr: Translate;
}) {
  const t = useTranslations("clubPartners");
  const proposed = item.request?.to ?? item.live;
  const [value, setValue] = useState(proposed.pct !== null ? String(proposed.pct) : "");
  const [reason, setReason] = useState("");
  const on = !proposed.hidden;
  const cap = item.defaultPct;

  const typed = parsePct(value);
  const over = typed !== null && cap !== null && typed > cap;
  const stale = item.live.pct !== null && cap !== null && item.live.pct > cap;

  const commit = () => {
    const pct = parsePct(value);
    if (pct === proposed.pct) return;
    const check = checkOverridePct(pct, cap);
    if (!check.ok) {
      onInvalid(
        check.reason === "aboveDefault"
          ? t("errors.aboveDefault", { cap: check.cap ?? 0 })
          : check.reason === "noDefault"
            ? t("errors.noDefault")
            : t("errors.range"),
      );
      setValue(proposed.pct !== null ? String(proposed.pct) : "");
      return;
    }
    onChange({ hidden: proposed.hidden, pct });
  };

  const sees = item.live.hidden
    ? t("unit.residentSeesHidden")
    : (formatDiscount(effectivePct(cap, item.live.pct), item.note, "th") ?? t("unit.comingSoon"));

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-2.5 border-b border-adm-line py-2 last:border-b-0",
        item.request ? "rounded-[10px] bg-adm-warning-bg/50 px-1.5" : "",
      ].join(" ")}
    >
      <span className={on ? "" : "opacity-55"}>
        <PartnerAvatar category={item.category} cover={item.coverImage} size={32} />
      </span>
      <div className={`min-w-0 flex-1 ${on ? "" : "opacity-55"}`}>
        <b className="flex flex-wrap items-center gap-1 text-sm font-medium text-adm-text">
          {item.name}
          {!item.request && item.live.hidden && (
            <span className="rounded-full bg-adm-warning/13 px-2 text-[10.5px] text-adm-warning">{t("unit.hiddenBadge")}</span>
          )}
          {!item.request && !item.live.hidden && item.live.pct !== null && !stale && (
            <span className="rounded-full bg-adm-fill/20 px-2 text-[10.5px] text-adm-accent-ink">{t("unit.adjustedBadge")}</span>
          )}
          {stale && (
            <span
              className="rounded-full bg-adm-danger/13 px-2 text-[10.5px] text-adm-danger"
              title={t("unit.staleTitle", { pct: item.live.pct ?? 0, cap: cap ?? 0 })}
            >
              {t("unit.staleBadge")}
            </span>
          )}
        </b>
        <small className="text-[11.5px] text-adm-muted">{item.area || "—"}</small>
        {item.validity.state !== "open" && item.validity.state !== "ok" && <ValidityLine validity={item.validity} locale={locale} />}
      </div>

      <div className="ml-2 flex items-center gap-0.5">
        <PctField
          prefix={t("benefit.off")}
          size="sm"
          tone={over || stale ? "bad" : proposed.pct !== null ? "override" : "default"}
          title={cap ? t("unit.pctTitle", { cap }) : t("errors.noDefault")}
          inputProps={{
            value,
            max: cap ?? 0,
            placeholder: cap ? String(cap) : "—",
            disabled: !on || !cap || busy,
            "aria-label": t("unit.pctLabel", { name: item.name }),
            "aria-invalid": over || undefined,
            onChange: (event) => setValue(event.target.value),
            onBlur: commit,
            onKeyDown: (event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            },
          }}
        />
        {proposed.pct !== null && (
          <button
            type="button"
            className="admin-btn-quiet admin-btn-sm px-1.5!"
            title={t("unit.resetOne")}
            aria-label={`${t("unit.resetOne")}: ${item.name}`}
            disabled={busy}
            onClick={() => {
              setValue("");
              onChange({ hidden: proposed.hidden, pct: null });
            }}
          >
            <RotateCcw size={12} aria-hidden />
          </button>
        )}
      </div>
      <span className="ml-2.5">
        <Switch
          checked={on}
          label={on ? t("unit.switchOff", { name: item.name }) : t("unit.switchOn", { name: item.name })}
          disabled={busy}
          onClick={() => onChange({ hidden: on, pct: proposed.pct })}
        />
      </span>
      {over && <div className="basis-full pl-[44px] text-[11.5px] text-adm-danger">{t("errors.aboveDefault", { cap: cap ?? 0 })}</div>}

      {item.request && (
        <div className="flex basis-full flex-wrap items-center gap-1.5 pb-0.5 pl-[44px] pt-1 text-[11.5px] text-adm-muted">
          <span className="rounded-full bg-adm-warning/13 px-2 py-px text-[10.5px] font-medium text-adm-warning">{t("unit.pendingBadge")}</span>
          <span className="text-adm-text">{describeChange(tr, item.live, item.request.to, cap)}</span>
          <span>
            · {t("unit.requestMeta", { name: item.request.by, time: fmtDateTime(item.request.at, locale) })} ·{" "}
            {t("unit.residentSees", { value: sees })}
          </span>
          <span className="ml-auto flex gap-1.5">
            {canApprove && !item.request.own ? (
              rejecting ? (
                <>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("approvals.reasonPlaceholder")}
                    maxLength={300}
                    className="admin-input h-7! w-40 py-0! text-xs!"
                    autoFocus
                  />
                  <button type="button" className="admin-btn-danger admin-btn-sm" disabled={busy} onClick={() => onDecide(false, reason)}>
                    {t("approvals.rejectConfirm")}
                  </button>
                  <button type="button" className="admin-btn-quiet admin-btn-sm" onClick={onRejectBack}>
                    {t("approvals.back")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="admin-btn admin-btn-sm" disabled={busy} onClick={() => onDecide(true)}>
                    {t("approvals.approve")}
                  </button>
                  <button type="button" className="admin-btn-danger admin-btn-sm" disabled={busy} onClick={onReject}>
                    {t("approvals.reject")}
                  </button>
                </>
              )
            ) : item.request.own ? (
              <button type="button" className="admin-btn-ghost admin-btn-sm" disabled={busy} onClick={onCancel}>
                {t("approvals.cancel")}
              </button>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
}
