"use client";

/**
 * components/admin/SitePlan3dCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The units tab's card for a project's 3D site plan: which scene file it
 * uses, whether that file draws every plot in the system, the switch that
 * shows or hides the 3D view on the public page, and a preview of it.
 *
 * Nothing about statuses is set here. The scene is fed the same statuses
 * the tiles on this page edit (SitePlan3D sends them in), so the preview,
 * like the public page, always shows the current state.
 *
 * Only rendered for a project listed in lib/site-plan-3d.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box, CheckCircle2, AlertTriangle, Maximize2, X } from "lucide-react";
import type { UnitStatus } from "@prisma/client";
import SitePlan3D from "@/components/SitePlan3D";
import { setSitePlan3dEnabled } from "@/app/[locale]/admin/(catalog)/projects/[id]/units/actions";
import { showUndoToast } from "@/components/admin/UndoToast";
import type { SceneCheck } from "@/lib/site-plan-3d-check";

type PreviewUnit = { unitNumber: string; status: UnitStatus; landAreaSqm: number | null };

type Props = {
  locale: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  src: string;
  enabled: boolean;
  canWrite: boolean;
  check: SceneCheck | null;
  units: PreviewUnit[];
  masterPlanImageUrl: string | null;
  labels: {
    title: string;
    isNew: string;
    file: string;
    plots: string;
    /** "30 / 30 match the system" — formatted by the page. */
    matched: string;
    mismatch: string;
    unreadable: string;
    statusSource: string;
    statusSourceValue: string;
    show: string;
    shown: string;
    hidden: string;
    preview: string;
    previewTitle: string;
    previewSub: string;
    close: string;
    missing: string;
    extra: string;
    error: string;
  };
};

export default function SitePlan3dCard({
  locale,
  projectId,
  projectSlug,
  projectName,
  src,
  enabled,
  canWrite,
  check,
  units,
  masterPlanImageUrl,
  labels,
}: Props) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!previewOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await setSitePlan3dEnabled(locale, projectId, projectSlug, next);
      if (!result.ok) {
        setOn(!next);
        showUndoToast({ message: labels.error });
        return;
      }
      showUndoToast({ message: next ? labels.shown : labels.hidden });
      router.refresh();
    });
  };

  // The public page treats TRANSFERRED as SOLD; the preview does the same.
  const sceneUnits = units.map((u) => ({
    unitNumber: u.unitNumber,
    status: (u.status === "TRANSFERRED" ? "SOLD" : u.status) as "AVAILABLE" | "RESERVED" | "SOLD",
    landAreaSqm: u.landAreaSqm,
  }));

  const fileName = src.split("/").pop() ?? src;
  const matched = check && check.missing.length === 0 && check.extra.length === 0;

  return (
    <section className="admin-card overflow-hidden p-0!" aria-labelledby="site-plan-3d-title">
      <div className="relative h-28 overflow-hidden bg-adm-text/4">
        {masterPlanImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, as the 2D plan card beside it
          <img src={masterPlanImageUrl} alt="" className="h-full w-full object-cover saturate-[.6]" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Box size={28} aria-hidden className="text-adm-muted" />
          </span>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-md bg-adm-band px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
          3D
        </span>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="site-plan-3d-title" className="text-sm font-semibold text-adm-text">
            {labels.title}
          </h2>
          <span className="rounded-full bg-adm-fill px-2 py-px text-[10.5px] font-semibold text-adm-on-fill">{labels.isNew}</span>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          <dt className="text-adm-muted">{labels.file}</dt>
          <dd className="admin-mono truncate text-right text-adm-text" title={src}>
            {fileName}
          </dd>
          <dt className="text-adm-muted">{labels.plots}</dt>
          <dd className="text-right">
            {check === null ? (
              <span className="text-adm-warning">{labels.unreadable}</span>
            ) : matched ? (
              <span className="inline-flex items-center gap-1 font-medium text-adm-success">
                <CheckCircle2 size={13} aria-hidden />
                {labels.matched}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-adm-warning">
                <AlertTriangle size={13} aria-hidden />
                {labels.mismatch}
              </span>
            )}
          </dd>
          <dt className="text-adm-muted">{labels.statusSource}</dt>
          <dd className="text-right text-adm-text">{labels.statusSourceValue}</dd>
        </dl>

        {check && !matched && (
          <div className="space-y-1 rounded-[10px] bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">
            {check.missing.length > 0 && (
              <p>
                {labels.missing} <span className="admin-mono">{check.missing.join(", ")}</span>
              </p>
            )}
            {check.extra.length > 0 && (
              <p>
                {labels.extra} <span className="admin-mono">{check.extra.join(", ")}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-adm-line pt-3 text-[13px] text-adm-text">
          <span id="site-plan-3d-switch">{labels.show}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="site-plan-3d-switch"
            disabled={!canWrite || pending}
            onClick={toggle}
            className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              on ? "bg-adm-info" : "bg-adm-line-strong"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform ${
                on ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>

        <button type="button" className="admin-btn w-full" onClick={() => setPreviewOpen(true)}>
          <Maximize2 size={14} aria-hidden />
          {labels.preview}
        </button>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 print:hidden" role="presentation">
          <button
            type="button"
            tabIndex={-1}
            aria-label={labels.close}
            onClick={() => setPreviewOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-adm-band/40 motion-safe:animate-[lead-drawer-fade_150ms_ease-out]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-plan-3d-preview-title"
            className="absolute bottom-2.5 right-2.5 top-2.5 flex w-[min(1100px,calc(100vw-20px))] flex-col overflow-hidden rounded-[20px] bg-adm-solid shadow-[var(--adm-shadow-float)] motion-safe:animate-[lead-drawer-in_200ms_ease-out]"
          >
            <div className="flex items-center gap-3 border-b border-adm-line px-5 py-3.5">
              <div className="min-w-0">
                <h2 id="site-plan-3d-preview-title" className="text-[15px] font-semibold text-adm-text">
                  {labels.previewTitle}
                </h2>
                <p className="text-xs text-adm-muted">{labels.previewSub}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label={labels.close}
                className="admin-btn-ghost ml-auto h-8 w-8 p-0!"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <SitePlan3D
                src={src}
                locale={locale}
                projectName={projectName}
                units={sceneUnits}
                title={labels.previewTitle}
                frameClassName="h-full w-full bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
