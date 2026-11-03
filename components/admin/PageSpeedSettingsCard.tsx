"use client";

/**
 * components/admin/PageSpeedSettingsCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The PageSpeed Insights key and the speed tab's schedule. The key is
 * write-only here: the page is told where it comes from and its last four
 * characters, never the key itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Gauge, Loader2, Zap } from "lucide-react";
import type {
  PsiActionResult,
  PsiTestResult,
} from "@/app/[locale]/admin/(system)/settings/integrations/psi-actions";

type Schedule = "daily" | "weekly" | "off";
type Strategies = "both" | "mobile" | "desktop";

export type PsiCardLabels = Record<string, string>;

type Props = {
  keySource: "admin" | "env" | null;
  keyHint: string | null;
  undecryptable: boolean;
  schedule: Schedule;
  strategies: Strategies;
  alertBelow: number;
  dailyCap: number;
  usageToday: number;
  googleQuota: number;
  labels: PsiCardLabels;
  save: (input: {
    apiKey?: string;
    clearKey?: boolean;
    schedule?: Schedule;
    strategies?: Strategies;
    alertBelow?: number;
    dailyCap?: number;
  }) => Promise<PsiActionResult>;
  test: () => Promise<PsiTestResult>;
};

export default function PageSpeedSettingsCard(props: Props) {
  const { labels: l } = props;
  const L = (key: string, vars: Record<string, string | number> = {}) =>
    (l[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
  const router = useRouter();
  const [key, setKey] = useState("");
  const [schedule, setSchedule] = useState<Schedule>(props.schedule);
  const [strategies, setStrategies] = useState<Strategies>(props.strategies);
  const [alertOn, setAlertOn] = useState(props.alertBelow > 0);
  const [alertBelow, setAlertBelow] = useState(props.alertBelow > 0 ? props.alertBelow : 70);
  const [dailyCap, setDailyCap] = useState(props.dailyCap);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [saved, setSaved] = useState<PsiActionResult | null>(null);
  const [tested, setTested] = useState<PsiTestResult | null>(null);

  const err = (code: string, detail?: string) => `${L(`err.${code}`)}${detail ? ` — ${detail}` : ""}`;

  function submit(input: Parameters<Props["save"]>[0]) {
    setSaved(null);
    startSave(async () => {
      const outcome = await props.save(input);
      setSaved(outcome);
      if (outcome.ok) {
        setKey("");
        router.refresh();
      }
    });
  }

  function onTest() {
    setTested(null);
    startTest(async () => {
      setTested(await props.test());
      router.refresh();
    });
  }

  const status =
    props.keySource === "admin" ? L("statusAdmin") : props.keySource === "env" ? L("statusEnv") : L("statusNone");
  const number = new Intl.NumberFormat();

  return (
    <section className="admin-card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
            <Gauge size={15} className="text-adm-accent-ink" aria-hidden />
            {L("title")}
          </h3>
          <p className="admin-hint mt-1 max-w-xl">{L("subtitle", { quota: number.format(props.googleQuota) })}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            props.keySource ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-muted"
          }`}
        >
          {status}
        </span>
      </div>

      {props.undecryptable && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">
          {L("undecryptable")}
        </p>
      )}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit({
            apiKey: key || undefined,
            schedule,
            strategies,
            alertBelow: alertOn ? alertBelow : 0,
            dailyCap,
          });
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="admin-label">{L("keyLabel")}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={props.keySource ? L("keyPlaceholderKeep") : L("keyPlaceholderNew")}
              className="admin-input mt-1 font-mono text-xs"
            />
            <span className="admin-hint mt-1 block">
              {props.keyHint ? L("keyHint", { last: props.keyHint }) : L("keyHintNone")}
            </span>
          </label>

          <div className="block">
            <span className="admin-label">{L("scheduleLabel")}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <select
                aria-label={L("scheduleLabel")}
                value={schedule}
                onChange={(event) => setSchedule(event.target.value as Schedule)}
                className="admin-input min-w-44 flex-1"
              >
                <option value="weekly">{L("schedule.weekly")}</option>
                <option value="daily">{L("schedule.daily")}</option>
                <option value="off">{L("schedule.off")}</option>
              </select>
              <select
                aria-label={L("strategiesLabel")}
                value={strategies}
                onChange={(event) => setStrategies(event.target.value as Strategies)}
                className="admin-input min-w-40 flex-1"
              >
                <option value="both">{L("strategies.both")}</option>
                <option value="mobile">{L("strategies.mobile")}</option>
                <option value="desktop">{L("strategies.desktop")}</option>
              </select>
            </div>
            <span className="admin-hint mt-1 block">{L("scheduleHint")}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-adm-text">
            <input type="checkbox" checked={alertOn} onChange={(event) => setAlertOn(event.target.checked)} className="size-4" />
            {L("alertLabel")}
            <input
              type="number"
              min={1}
              max={100}
              value={alertBelow}
              disabled={!alertOn}
              onChange={(event) => setAlertBelow(Number(event.target.value))}
              aria-label={L("alertThreshold")}
              className="admin-input w-20! py-1!"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-adm-text">
            {L("capLabel")}
            <input
              type="number"
              min={10}
              max={props.googleQuota}
              value={dailyCap}
              onChange={(event) => setDailyCap(Number(event.target.value))}
              className="admin-input w-28! py-1!"
            />
            <span className="admin-hint">{L("capUnit")}</span>
          </label>
        </div>

        <div className="rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm">
          <p className="text-xs text-adm-muted">
            {L("usage", {
              used: number.format(props.usageToday),
              cap: number.format(props.dailyCap),
              quota: number.format(props.googleQuota),
            })}
          </p>
          {tested?.ok && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-adm-success">
              <Check size={14} aria-hidden />
              {L(tested.cached ? "testCached" : "testOk", { score: tested.performance ?? "–", seconds: tested.seconds })}
            </p>
          )}
          {tested && !tested.ok && <p className="mt-1.5 text-adm-danger">{err(tested.error, tested.detail)}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-adm-accent-ink underline"
          >
            {L("getKey")}
            <ExternalLink size={11} aria-hidden />
          </a>
          <span className="ml-auto" />
          {saved?.ok && (
            <span className="inline-flex items-center gap-1 text-xs text-adm-success">
              <Check size={13} aria-hidden />
              {L("saved")}
            </span>
          )}
          {saved && !saved.ok && <span className="text-xs text-adm-danger">{err(saved.error, saved.detail)}</span>}
          {props.keySource === "admin" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => submit({ clearKey: true })}
              className="admin-btn-ghost text-adm-danger!"
            >
              {L("removeKey")}
            </button>
          )}
          <button type="button" onClick={onTest} disabled={testing || !props.keySource} className="admin-btn-ghost">
            {testing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Zap size={14} aria-hidden />}
            {testing ? L("testing") : L("test")}
          </button>
          <button type="submit" disabled={saving} className="admin-btn">
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
            {L("save")}
          </button>
        </div>
      </form>
    </section>
  );
}
