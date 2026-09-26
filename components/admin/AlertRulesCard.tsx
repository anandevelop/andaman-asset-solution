"use client";

/**
 * components/admin/AlertRulesCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Which alerts are allowed to speak.
 *
 * WHAT THIS CARD DELIBERATELY CANNOT DO
 *
 * It cannot change a threshold. "More than fifty 404s in a day" is a
 * constant in lib/seo/alert-rules.ts, and the number printed beside each
 * rule here is read from that same constant — so the screen can never show
 * one figure while another is applied. What the team asked to control is
 * whether a rule speaks at all, and that is all this offers.
 *
 * TWO RULES ARE LISTED BUT CANNOT FIRE
 *
 * Index coverage and search clicks arrive with phases 5 and 4. Their rows
 * are shown, switchable, and marked as waiting for Google. Hiding them
 * would leave a team believing five rules are watching when three are —
 * which is exactly the belief an alerting system must never create.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RuleResult } from "@/app/[locale]/admin/(growth)/reports/actions";

export type AlertRuleView = {
  kind: string;
  label: string;
  detail: string;
  enabled: boolean;
  /** Listed, switchable, and unable to fire until phase 4/5. */
  awaitingGoogle: boolean;
};

export type AlertRulesLabels = {
  title: string;
  hint: string;
  awaitingGoogle: string;
  failed: string;
};

type Props = {
  labels: AlertRulesLabels;
  rules: AlertRuleView[];
  action: (kind: string, enabled: boolean) => Promise<RuleResult>;
};

export default function AlertRulesCard({ labels, rules, action }: Props) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  /*
    Optimistic, and reconciled by the revalidate the action performs. A
    switch that does not move until a round trip finishes gets clicked
    twice, and the second click turns the rule back off.
  */
  const [local, setLocal] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rules.map((rule) => [rule.kind, rule.enabled])),
  );

  function toggle(kind: string, next: boolean) {
    setLocal((current) => ({ ...current, [kind]: next }));
    setFailed(null);

    startTransition(async () => {
      const result = await action(kind, next);
      if (!result.ok) {
        setLocal((current) => ({ ...current, [kind]: !next }));
        setFailed(kind);
      }
    });
  }

  return (
    <section className="admin-card print:hidden">
      <div className="flex items-baseline gap-2">
        <h3 className="admin-label mb-0">{labels.title}</h3>
        {pending && (
          <Loader2
            size={13}
            className="animate-spin text-ink-muted"
            aria-hidden
          />
        )}
      </div>
      <p className="admin-hint">{labels.hint}</p>

      <ul className="mt-3 space-y-1.5">
        {rules.map((rule) => (
          <li
            key={rule.kind}
            className="flex items-start justify-between gap-3 rounded-xs border border-primary/10 px-3 py-2"
          >
            <div>
              <p className="text-sm text-ink">{rule.label}</p>
              <p className="text-xs text-ink-muted">{rule.detail}</p>

              {rule.awaitingGoogle && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-800">
                  <AlertTriangle size={11} aria-hidden />
                  {labels.awaitingGoogle}
                </p>
              )}

              {failed === rule.kind && (
                <p className="mt-1 text-[11px] text-red-700">{labels.failed}</p>
              )}
            </div>

            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={local[rule.kind] ?? rule.enabled}
                onChange={(event) => toggle(rule.kind, event.target.checked)}
                className="h-4 w-4"
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
