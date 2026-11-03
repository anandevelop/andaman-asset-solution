"use client";

/**
 * components/admin/PageSpeedControls.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The speed tab's interactive pieces. Which page and device are shown lives
 * in the URL (?path=&device=&lang=), so the server renders the numbers and
 * these only move the URL or press Google's button:
 *
 *   SpeedPicker      device toggle, page chips, project menu, pasted link
 *   SpeedScanButton  "scan everything", with progress while it runs
 *   SpeedTestButton  test the page on screen now
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { pathFromPastedUrl } from "@/lib/pagespeed/parse";
import {
  scanStateAction,
  startScanAction,
  testPageAction,
} from "@/app/[locale]/admin/(growth)/seo/speed/actions";

type Labels = Record<string, string>;
const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

const chip = (active: boolean) =>
  `h-10 rounded-full px-4 text-sm transition-colors ${
    active
      ? "bg-adm-strong font-medium text-adm-on-strong"
      : "bg-adm-solid text-adm-text shadow-[0_0_0_1px_var(--adm-line-strong)] hover:bg-adm-text/4"
  }`;

export function SpeedPicker({
  device,
  lang,
  selected,
  presets,
  projects,
  siteUrl,
  labels: l,
}: {
  device: "mobile" | "desktop";
  lang: string;
  selected: string;
  presets: { key: string; path: string; label: string }[];
  projects: { path: string; name: string }[];
  siteUrl: string;
  labels: Labels;
}) {
  const go = useNavigate();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onProject = projects.some((p) => p.path === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={l.device} className="flex rounded-full bg-adm-solid p-1 shadow-[0_0_0_1px_var(--adm-line)]">
          {(["mobile", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => go({ device: d })}
              className={`h-9 rounded-full px-4 text-sm ${device === d ? "bg-adm-strong font-medium text-adm-on-strong" : "text-adm-muted hover:text-adm-text"}`}
            >
              {l[d]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-adm-muted">
          {l.language}
          <select
            value={lang}
            onChange={(event) => go({ lang: event.target.value, path: null })}
            className="admin-input w-auto! py-1.5!"
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ru">Русский</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-adm-muted">{l.pagesLabel}</span>
        <button type="button" aria-pressed={selected === "all"} onClick={() => go({ path: "all" })} className={chip(selected === "all")}>
          {l.allPages}
        </button>
        {presets
          .filter((p) => p.key !== "project")
          .map((p) => (
            <button key={p.key} type="button" aria-pressed={selected === p.path} onClick={() => go({ path: p.path })} className={chip(selected === p.path)}>
              {p.label}
            </button>
          ))}
        {projects.length > 0 && (
          <select
            aria-label={l.projectPage}
            value={onProject ? selected : ""}
            onChange={(event) => event.target.value && go({ path: event.target.value })}
            className={`${chip(onProject)} appearance-auto pr-2`}
          >
            <option value="">{l.projectPage}</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <form
          className="flex min-w-0 flex-[1_1_320px] gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const path = pathFromPastedUrl(pasted, siteUrl);
            if (!path) return setError(l.badUrl);
            setError(null);
            setPasted("");
            go({ path });
          }}
        >
          <input
            type="text"
            inputMode="url"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={l.pastePlaceholder}
            aria-label={l.pastePlaceholder}
            className="admin-input h-10! min-w-0 flex-1 rounded-full! px-4!"
          />
          <button type="submit" className="h-10 shrink-0 rounded-full bg-adm-fill px-4 text-sm font-semibold text-adm-on-fill">
            {l.check}
          </button>
        </form>
      </div>
      {error && <p className="text-xs text-adm-danger">{error}</p>}
    </div>
  );
}

export function SpeedTestButton({
  locale,
  path,
  device,
  hasResult,
  labels: l,
}: {
  locale: string;
  path: string;
  device: "mobile" | "desktop";
  hasResult: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (force: boolean) =>
    start(async () => {
      setMessage(null);
      const result = await testPageAction(locale, path, device, force);
      if (result.ok) {
        setMessage({ ok: true, text: result.cached ? l.cachedResult : l.tested });
        router.refresh();
      } else setMessage({ ok: false, text: `${l[`err.${result.error}`] ?? result.error}${result.detail ? ` — ${result.detail}` : ""}` });
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(false)} className="admin-btn">
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
          {pending ? l.testing : hasResult ? l.testAgain : l.testNow}
        </button>
        {hasResult && !pending && (
          <button type="button" onClick={() => run(true)} className="admin-btn-ghost text-xs">
            {l.forceTest}
          </button>
        )}
      </div>
      {pending && <p className="text-xs text-adm-muted">{l.testingHint}</p>}
      {message && <p className={`text-xs ${message.ok ? "text-adm-success" : "text-adm-danger"}`}>{message.text}</p>}
    </div>
  );
}

type Scan = { startedAt: string; finishedAt: string | null; total: number; done: number; failed: number };

export function SpeedScanButton({ initial, labels: l }: { initial: Scan | null; labels: Labels }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // The server passes `initial` only while a scan is genuinely running.
  const running = Boolean(scan && !scan.finishedAt);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const next = await scanStateAction();
      setScan(next);
      if (next?.finishedAt) router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [running, router]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || running}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const result = await startScanAction();
            if (!result.ok) {
              setMessage(
                result.error === "COOLDOWN" && result.until
                  ? fill(l["err.COOLDOWN"], { time: time(result.until) })
                  : (l[`err.${result.error}`] ?? result.error),
              );
              return;
            }
            setScan({ startedAt: new Date().toISOString(), finishedAt: null, total: 0, done: 0, failed: 0 });
          })
        }
        className="admin-btn rounded-full! px-4"
      >
        {pending || running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
        {running ? fill(l.scanning, { done: scan?.done ?? 0, total: scan?.total || "…" }) : l.scanAll}
      </button>
      {running && scan && scan.total > 0 && (
        <div className="h-1 w-48 overflow-hidden rounded-full bg-adm-text/8" aria-hidden>
          <div className="h-full bg-adm-fill transition-all" style={{ width: `${(scan.done / scan.total) * 100}%` }} />
        </div>
      )}
      {message && <p className="text-xs text-adm-danger">{message}</p>}
    </div>
  );
}
