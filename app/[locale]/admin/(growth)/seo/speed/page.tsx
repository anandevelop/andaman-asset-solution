/**
 * /admin/seo/speed — "ความเร็ว": PageSpeed Insights for the site's pages.
 *
 * Which page, device and language are on screen lives in the URL
 * (?path=&device=&lang=). path "all" is the average over every page tested;
 * anything else is one page's latest run, its history and its fixes.
 * Calls to Google go through lib/pagespeed/run.ts, which holds the brakes.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role, type PageSpeedRun } from "@prisma/client";
import { ExternalLink, Gauge } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { intlLocale } from "@/lib/format";
import { getPsiConfig } from "@/lib/pagespeed/config";
import { getScanState, lastFailure, latestByPath, pathHistory, presetPages, scanBlocked, siteBase } from "@/lib/pagespeed/run";
import { scoreBand, type FieldData, type Opportunity } from "@/lib/pagespeed/parse";
import { SpeedPicker, SpeedScanButton, SpeedTestButton } from "@/components/admin/PageSpeedControls";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ path?: string; device?: string; lang?: string }>;
};

const LANGS = ["th", "en", "zh", "ru"] as const;

const BAND = {
  good: { ring: "var(--adm-success)", soft: "bg-adm-success-bg text-adm-success" },
  ni: { ring: "#c26a00", soft: "bg-adm-warning-bg text-adm-warning" },
  poor: { ring: "var(--adm-danger)", soft: "bg-adm-danger-bg text-adm-danger" },
  none: { ring: "var(--adm-line-strong)", soft: "bg-adm-neutral-bg text-adm-muted" },
} as const;

/** Google's lab thresholds: [good up to, poor from]. */
const LAB: Record<string, [number, number]> = {
  fcpMs: [1800, 3000],
  lcpMs: [2500, 4000],
  tbtMs: [200, 600],
  siMs: [3400, 5800],
  cls: [100, 250],
};

function labBand(key: string, value: number | null): keyof typeof BAND {
  const t = LAB[key];
  if (!t || value === null) return "none";
  return value <= t[0] ? "good" : value < t[1] ? "ni" : "poor";
}

const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)}`);

function Ring({ value, label }: { value: number | null; label: string }) {
  const band = BAND[scoreBand(value)];
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${label}: ${value ?? "–"}`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--adm-line)" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={band.ring}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${((value ?? 0) / 100) * c} ${c}`}
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="49" textAnchor="middle" fontSize="22" fontWeight="700" fill={band.ring}>
          {value ?? "–"}
        </text>
      </svg>
      <span className="text-center text-xs text-adm-text">{label}</span>
    </div>
  );
}

const avg = (values: (number | null)[]) => {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
};

export default async function SeoSpeedPage(props: Props) {
  const { locale } = await props.params;
  const search = await props.searchParams;
  await requireAdmin(locale, Role.ADMIN);
  const t = await getTranslations({ locale, namespace: "admin.seo.speed" });

  const device = search.device === "desktop" ? "desktop" : "mobile";
  const lang = (LANGS as readonly string[]).includes(search.lang ?? "") ? (search.lang as string) : "th";

  const loaded = await Promise.all([
    getPsiConfig(),
    presetPages(lang),
    prisma.project.findMany({
      where: { isPublished: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, nameEn: true, nameTh: true },
    }),
    latestByPath(device),
    getScanState(),
  ]).catch((error) => {
    console.error("[seo/speed] could not load", error);
    return null;
  });
  // Unreachable database: say so rather than show an empty, healthy-looking tab.
  if (!loaded) {
    const tAdmin = await getTranslations({ locale, namespace: "admin" });
    return (
      <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
        {tAdmin("common.offline")}
      </p>
    );
  }
  const [config, presets, projectRows, rows, scan] = loaded;

  const selected = search.path === "all" ? "all" : search.path?.startsWith("/") ? search.path : `/${lang}`;
  const [history, failure] =
    selected === "all" ? [[] as PageSpeedRun[], null] : await Promise.all([pathHistory(selected, device), lastFailure(selected, device)]);
  const latest = history.at(-1) ?? null;

  const presetLabels = presets.map((p) => ({ ...p, label: p.key === "project" ? (p.label ?? t("preset.project")) : t(`preset.${p.key}`) }));
  const projects = projectRows.map((p) => ({ path: `/${lang}/projects/${p.slug}`, name: (lang === "th" ? p.nameTh : p.nameEn) || p.nameEn }));
  const nameOf = (path: string) =>
    presetLabels.find((p) => p.path === path)?.label ?? projects.find((p) => p.path === path)?.name ?? null;

  const when = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const pickerLabels = Object.fromEntries(
    ["device", "mobile", "desktop", "language", "pagesLabel", "allPages", "projectPage", "pastePlaceholder", "check", "badUrl"].map((k) => [k, t.raw(`picker.${k}`) as string]),
  );
  const actionLabels = {
    ...Object.fromEntries(
      ["testNow", "testAgain", "forceTest", "testing", "testingHint", "tested", "cachedResult", "scanAll", "scanning"].map((k) => [k, t.raw(`action.${k}`) as string]),
    ),
    ...Object.fromEntries(
      ["NO_KEY", "DAILY_CAP", "RATE_LIMITED", "BAD_KEY", "FETCH_FAILED", "UNREACHABLE", "RUNNING", "COOLDOWN", "BAD_URL", "FORBIDDEN"].map((k) => [`err.${k}`, t.raw(`err.${k}`) as string]),
    ),
  };

  const scores =
    selected === "all"
      ? {
          performance: avg(rows.map((r) => r.latest.performance)),
          accessibility: avg(rows.map((r) => r.latest.accessibility)),
          bestPractices: avg(rows.map((r) => r.latest.bestPractices)),
          seo: avg(rows.map((r) => r.latest.seo)),
        }
      : latest;
  const field = (latest?.field ?? null) as FieldData | null;
  const opportunities = (latest?.opportunities ?? []) as Opportunity[];
  // A state stuck "running" for half an hour is a crashed scan, not a live one.
  const scanRunning = scanBlocked(scan, "scheduled")?.reason === "RUNNING";
  const lastScan = scan?.finishedAt ? when.format(new Date(scan.finishedAt)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="admin-label mb-0 flex items-center gap-2">
            <Gauge size={15} className="text-adm-accent-ink" aria-hidden />
            {t("title")}
          </h2>
          <p className="admin-hint">
            {t(`subtitle.${config.schedule}`)}
            {lastScan ? ` · ${t("lastScan", { time: lastScan })}` : ""}
          </p>
        </div>
        {config.apiKey && <SpeedScanButton initial={scanRunning ? scan : null} labels={actionLabels} />}
      </div>

      {!config.apiKey ? (
        <section className="admin-card space-y-2">
          <p className="text-sm text-adm-text">{t("noKey")}</p>
          <Link href={`/${locale}/admin/settings/integrations`} className="admin-btn inline-flex">
            {t("goToSettings")}
          </Link>
        </section>
      ) : (
        <>
          <SpeedPicker
            device={device}
            lang={lang}
            selected={selected}
            presets={presetLabels}
            projects={projects}
            siteUrl={siteBase()}
            labels={pickerLabels}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="admin-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-adm-text">
                    {selected === "all" ? t("averageTitle", { count: rows.length }) : (nameOf(selected) ?? t("thisPage"))}
                    <span className="font-normal text-adm-muted"> · {t(`picker.${device}`)}</span>
                  </h3>
                  {selected !== "all" && <p className="truncate font-mono text-xs text-adm-muted">{selected}</p>}
                </div>
                {latest && <span className="text-xs text-adm-muted">{when.format(latest.createdAt)}</span>}
              </div>
              {scores && (selected === "all" ? rows.length > 0 : true) ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Ring value={scores.performance} label={t("cat.performance")} />
                  <Ring value={scores.accessibility} label={t("cat.accessibility")} />
                  <Ring value={scores.bestPractices} label={t("cat.bestPractices")} />
                  <Ring value={scores.seo} label={t("cat.seo")} />
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-adm-muted">{t(selected === "all" ? "noRunsYet" : "notTested")}</p>
              )}
              {failure && (!latest || failure.createdAt > latest.createdAt) && (
                <p className="rounded-xs bg-adm-danger-bg px-3 py-2 text-xs text-adm-danger">
                  {t("lastFailed", { time: when.format(failure.createdAt), error: t.raw(`err.${failure.error ?? "FETCH_FAILED"}`) as string })}
                </p>
              )}
              <p className="text-xs text-adm-muted">{t("bands")}</p>
              {selected !== "all" && (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SpeedTestButton locale={locale} path={selected} device={device} hasResult={Boolean(latest)} labels={actionLabels} />
                  <a
                    href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`${siteBase()}${selected}`)}&form_factor=${device}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn-ghost"
                  >
                    {t("openGoogle")}
                    <ExternalLink size={13} aria-hidden />
                  </a>
                </div>
              )}
            </section>

            <section className="admin-card space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-adm-text">{t("field.title")}</h3>
                {field?.overall && (
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${field.overall === "FAST" ? BAND.good.soft : field.overall === "AVERAGE" ? BAND.ni.soft : BAND.poor.soft}`}>
                    {t(`field.overall.${field.overall}`)}
                  </span>
                )}
              </div>
              {selected === "all" || !field ? (
                <p className="text-sm text-adm-muted">{t(selected === "all" ? "field.pickPage" : "field.none")}</p>
              ) : (
                <>
                  {(["lcp", "inp", "cls"] as const).map((key) => {
                    const m = field.metrics[key];
                    if (!m) return null;
                    const tone = m.category === "FAST" ? "text-adm-success" : m.category === "AVERAGE" ? "text-adm-warning" : "text-adm-danger";
                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex text-sm">
                          <span>{t(`field.${key}`)}</span>
                          <span className={`ml-auto font-semibold ${tone}`}>
                            {key === "cls" ? m.p75.toFixed(2) : key === "inp" ? `${m.p75} ms` : `${secs(m.p75)} ${t("sec")}`}
                          </span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
                          <span style={{ width: `${m.good * 100}%`, background: "var(--adm-success)" }} />
                          <span style={{ width: `${m.ni * 100}%`, background: "#e8a33d" }} />
                          <span style={{ width: `${m.poor * 100}%`, background: "var(--adm-danger)" }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-adm-muted">{t(field.scope === "origin" ? "field.originNote" : "field.note")}</p>
                </>
              )}
            </section>
          </div>

          {latest && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="admin-card space-y-4">
                <h3 className="text-sm font-semibold text-adm-text">{t("lab.title")}</h3>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {(
                    [
                      ["fcpMs", "FCP", `${secs(latest.fcpMs)} ${t("sec")}`],
                      ["lcpMs", "LCP", `${secs(latest.lcpMs)} ${t("sec")}`],
                      ["siMs", "Speed Index", `${secs(latest.siMs)} ${t("sec")}`],
                      ["tbtMs", "TBT", latest.tbtMs === null ? "–" : `${latest.tbtMs} ms`],
                      ["cls", "CLS", latest.cls === null ? "–" : (latest.cls / 1000).toFixed(2)],
                      ["pageBytes", t("lab.pageSize"), latest.pageBytes === null ? "–" : `${(latest.pageBytes / 1_048_576).toFixed(1)} MB`],
                    ] as const
                  ).map(([key, label, text]) => {
                    const band = labBand(key, latest[key as keyof PageSpeedRun] as number | null);
                    return (
                      <div key={key} className={`rounded-xs px-3 py-2.5 ${band === "none" ? "bg-adm-text/4" : BAND[band].soft}`}>
                        <p className="text-[11px] opacity-80">{label}</p>
                        <p className="text-lg font-bold tabular-nums">{text}</p>
                      </div>
                    );
                  })}
                </div>
                {history.length > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-adm-text">{t("history", { count: history.length })}</h4>
                    <div
                      className="flex h-16 items-end gap-1.5"
                      role="img"
                      aria-label={history.map((h) => h.performance ?? "–").join(", ")}
                    >
                      {history.map((h) => (
                        <span
                          key={h.id}
                          title={`${when.format(h.createdAt)} · ${h.performance ?? "–"}`}
                          className="flex-1 rounded-t-[3px]"
                          style={{ height: `${Math.max(4, h.performance ?? 0)}%`, background: BAND[scoreBand(h.performance)].ring }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="admin-card space-y-3">
                <h3 className="text-sm font-semibold text-adm-text">{t("fixes.title")}</h3>
                {opportunities.length === 0 ? (
                  <p className="text-sm text-adm-muted">{t("fixes.none")}</p>
                ) : (
                  <ul className="divide-y divide-adm-line">
                    {opportunities.map((o) => (
                      <li key={o.id} className="flex items-start gap-3 py-2.5 text-sm">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-[2px] ${o.savingsMs >= 1000 ? "bg-adm-danger" : "bg-[#e8a33d]"}`} aria-hidden />
                        <span className="flex-1 text-adm-text">{o.title}</span>
                        <span className={`shrink-0 font-semibold tabular-nums ${o.savingsMs >= 1000 ? "text-adm-danger" : "text-adm-warning"}`}>
                          {o.savingsMs > 0 ? `−${secs(o.savingsMs)} ${t("sec")}` : (o.metric ?? "")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          <section className="admin-card overflow-x-auto p-0!">
            <div className="border-b border-adm-line px-5 py-3.5">
              <h3 className="text-sm font-semibold text-adm-text">
                {t("table.title")} <span className="font-normal text-adm-muted">· {t(`picker.${device}`)}</span>
              </h3>
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-adm-muted">{t("noRunsYet")}</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
                    <th className="px-5 py-2.5 font-medium">{t("table.page")}</th>
                    <th className="px-3 py-2.5 font-medium">{t("table.score")}</th>
                    <th className="px-3 py-2.5 font-medium">LCP</th>
                    <th className="px-3 py-2.5 font-medium">TBT</th>
                    <th className="px-3 py-2.5 font-medium">CLS</th>
                    <th className="px-3 py-2.5 font-medium">{t("table.change")}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{t("table.tested")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .sort((a, b) => (a.latest.performance ?? 101) - (b.latest.performance ?? 101))
                    .map(({ path, latest: run, previousPerformance }) => {
                      const delta =
                        run.performance !== null && previousPerformance !== null ? run.performance - previousPerformance : null;
                      const href = `?${new URLSearchParams({ path, device, lang }).toString()}`;
                      return (
                        <tr key={path} className={`border-b border-adm-line last:border-b-0 ${path === selected ? "bg-adm-spot" : ""}`}>
                          <td className="px-5 py-2.5">
                            <Link href={href} scroll={false} className="block hover:underline">
                              {nameOf(path) && <span className="block text-adm-text">{nameOf(path)}</span>}
                              <span className="font-mono text-xs text-adm-muted">{path}</span>
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block min-w-9 rounded-full px-2 py-0.5 text-center font-bold ${BAND[scoreBand(run.performance)].soft}`}>
                              {run.performance ?? "–"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">{secs(run.lcpMs)} {t("sec")}</td>
                          <td className="px-3 py-2.5 tabular-nums">{run.tbtMs ?? "–"} ms</td>
                          <td className="px-3 py-2.5 tabular-nums">{run.cls === null ? "–" : (run.cls / 1000).toFixed(2)}</td>
                          <td className={`px-3 py-2.5 tabular-nums ${delta === null || delta === 0 ? "text-adm-muted" : delta > 0 ? "text-adm-success" : "text-adm-danger"}`}>
                            {delta === null || delta === 0 ? "—" : delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`}
                          </td>
                          <td className="px-5 py-2.5 text-right text-xs text-adm-muted">{when.format(run.createdAt)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-xs text-adm-muted">{t("limitsNote")}</p>
        </>
      )}
    </div>
  );
}
