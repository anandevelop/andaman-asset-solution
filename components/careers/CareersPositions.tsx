"use client";

/**
 * components/careers/CareersPositions.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The list of open positions and the application dialog it opens. One
 * dialog for the whole list: pressing a position opens it with that
 * position chosen, and the applicant can still change it inside.
 *
 * The dialog itself is loaded on first press (next/dynamic). Almost nobody
 * who reads the About page applies for a job, and its form, upload and
 * validation code would otherwise ride along in that page's first load.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import type { PublicPosition } from "@/lib/careers/positions";

const ApplyDialog = dynamic(() => import("@/components/careers/ApplyDialog"), { ssr: false });

type Props = {
  locale: string;
  positions: PublicPosition[];
  retentionMonths: number;
  hrEmail: string;
};

export default function CareersPositions({ locale, positions, retentionMonths, hrEmail }: Props) {
  const t = useTranslations("careers");
  // null = closed. A position id = open on that position.
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <p className="self-center border-y border-ink/15 py-8 text-sm font-light leading-relaxed text-ink/75">
        {t("noPositions")}
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.2em] text-ink/65 [:lang(th)_&]:text-xs [:lang(th)_&]:tracking-normal">
        <h3>{t("openPositions")}</h3>
        <span>{t("positionsCount", { count: positions.length })}</span>
      </div>

      <ul className="mt-2 border-b border-ink/15">
        {positions.map((position) => (
          <li key={position.id} className="border-t border-ink/15">
            <button
              type="button"
              onClick={() => setOpenFor(position.id)}
              aria-label={t("applyFor", { title: position.title })}
              className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 py-5 text-left"
            >
              <span className="min-w-0">
                <span className="block text-lg font-normal text-ink">{position.title}</span>
                <span className="mt-0.5 block text-xs text-ink/65">
                  {[t(`types.${position.employmentType}`), position.location].filter(Boolean).join(" · ")}
                </span>
                {position.summary && (
                  <span className="mt-2 block max-w-[60ch] whitespace-pre-line text-sm font-light leading-relaxed text-ink/70">
                    {position.summary}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink [:lang(th)_&]:text-sm [:lang(th)_&]:tracking-normal">
                <span className="hidden sm:inline">{t("apply")}</span>
                <ArrowRight
                  size={18}
                  strokeWidth={1.5}
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openFor !== null && (
        <ApplyDialog
          locale={locale}
          positions={positions}
          initialPositionId={openFor}
          retentionMonths={retentionMonths}
          hrEmail={hrEmail}
          onClose={() => setOpenFor(null)}
        />
      )}
    </div>
  );
}
