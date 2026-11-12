/**
 * components/admin/TrafficSourcesPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The "แหล่งที่มา & คลิก" tab of /admin/analytics: where visits come from,
 * AI assistants on a line of their own, and which contact buttons those
 * visitors press. Read from the day tables app/api/page-view and
 * app/api/click fill (lib/analytics/traffic-report.ts), plus the crawl log
 * for AI agents that read pages without a browser.
 *
 * A Server Component handed to AnalyticsTabs as a ready-made node, the way
 * the Meta and API panels are — the client tab strip only shows it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import type { TrafficChannel } from "@prisma/client";
import { Bot, MousePointerClick, Sparkles, Users } from "lucide-react";
import { getTrafficReport } from "@/lib/analytics/traffic-report";
import { intlLocale } from "@/lib/format";


/* Display names for the source keys lib/analytics/traffic-source.ts uses;
   a referring site keeps its host. */
const SOURCE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  copilot: "Copilot",
  deepseek: "DeepSeek",
  "meta-ai": "Meta AI",
  grok: "Grok",
  mistral: "Mistral",
  poe: "Poe",
  you: "You.com",
  phind: "Phind",
  kimi: "Kimi",
  doubao: "Doubao",
  qwen: "Qwen",
  google: "Google",
  "google-ads": "Google Ads",
  bing: "Bing",
  yahoo: "Yahoo",
  duckduckgo: "DuckDuckGo",
  baidu: "Baidu",
  yandex: "Yandex",
  naver: "Naver",
  ecosia: "Ecosia",
  brave: "Brave",
  sogou: "Sogou",
  facebook: "Facebook",
  instagram: "Instagram",
  line: "LINE",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
  wechat: "WeChat",
  vk: "VK",
  telegram: "Telegram",
  reddit: "Reddit",
  threads: "Threads",
};

const BOT_NAMES: Record<string, string> = {
  "chatgpt-user": "ChatGPT-User",
  "claude-user": "Claude-User",
  "perplexity-user": "Perplexity-User",
  "mistralai-user": "MistralAI-User",
  gptbot: "GPTBot",
  "oai-searchbot": "OAI-SearchBot",
  claudebot: "ClaudeBot",
  "claude-searchbot": "Claude-SearchBot",
  perplexitybot: "PerplexityBot",
  "google-other": "Google-Other",
  "meta-externalagent": "Meta-ExternalAgent",
  duckassistbot: "DuckAssistBot",
  amazonbot: "Amazonbot",
  bytespider: "Bytespider",
};

const CHANNEL_TONE: Record<TrafficChannel, string> = {
  AI: "bg-adm-strong text-adm-on-strong",
  SEARCH: "bg-adm-fill text-adm-text",
  SOCIAL: "bg-adm-fill text-adm-text",
  CAMPAIGN: "bg-adm-fill text-adm-text",
  REFERRAL: "bg-adm-fill text-adm-text",
  DIRECT: "bg-adm-fill text-adm-text",
};

export default async function TrafficSourcesPanel({ locale, days }: { locale: string; days: number }) {
  const [t, report] = await Promise.all([
    getTranslations({ locale, namespace: "admin.trafficSources" }),
    getTrafficReport(days),
  ]);

  const num = new Intl.NumberFormat(intlLocale(locale));
  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—");
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  const sourceName = (source: string) => SOURCE_NAMES[source] ?? (source === "direct" ? t("direct") : source);
  const channelName = (channel: TrafficChannel) => t(`channels.${channel}`);
  const actionName = (action: string) => (t.has(`actions.${action}`) ? t(`actions.${action}`) : action);

  const { totals } = report;
  const change =
    totals.previousVisits > 0
      ? Math.round(((totals.visits - totals.previousVisits) / totals.previousVisits) * 100)
      : null;
  const maxDay = Math.max(1, ...report.trend.map((d) => d.visits));
  const maxChannel = Math.max(1, ...report.channels.map((c) => c.visits));
  const empty = totals.visits === 0 && totals.clicks === 0;

  const stats = [
    {
      key: "visits",
      icon: <Users size={15} aria-hidden />,
      label: t("stats.visits"),
      value: num.format(totals.visits),
      note:
        change === null
          ? t("stats.noPrevious")
          : t("stats.vsPrevious", { change: `${change > 0 ? "+" : ""}${change}%` }),
    },
    {
      key: "ai",
      icon: <Sparkles size={15} aria-hidden />,
      label: t("stats.aiVisits"),
      value: num.format(totals.aiVisits),
      note: t("stats.share", { share: pct(totals.aiVisits, totals.visits) }),
    },
    {
      key: "clicks",
      icon: <MousePointerClick size={15} aria-hidden />,
      label: t("stats.clicks"),
      value: num.format(totals.clicks),
      note: t("stats.rate", { rate: pct(totals.clicks, totals.visits) }),
    },
    {
      key: "aiClicks",
      icon: <Bot size={15} aria-hidden />,
      label: t("stats.aiClicks"),
      value: num.format(totals.aiClicks),
      note: t("stats.rate", { rate: pct(totals.aiClicks, totals.aiVisits) }),
    },
  ];

  return (
    <div className="space-y-6">
      <p className="admin-hint">{t("subtitle")}</p>

      {empty && (
        <p className="admin-card text-sm text-adm-muted">{t("empty")}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.key} className="admin-card space-y-1 py-4!">
            <p className="flex items-center gap-2 text-xs text-adm-muted">
              {stat.icon}
              {stat.label}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-adm-text">{stat.value}</p>
            <p className="text-xs text-adm-muted">{stat.note}</p>
          </div>
        ))}
      </div>

      {/* Visits per day; the dark part of each bar is visits from AI. */}
      <section className="admin-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-adm-text">{t("trendTitle")}</h3>
          <p className="flex items-center gap-3 text-xs text-adm-muted">
            <span className="flex items-center gap-1.5">
              <i aria-hidden className="h-2.5 w-2.5 rounded-xs bg-adm-fill-2" /> {t("legendAll")}
            </span>
            <span className="flex items-center gap-1.5">
              <i aria-hidden className="h-2.5 w-2.5 rounded-xs bg-adm-strong" /> {t("legendAi")}
            </span>
          </p>
        </div>
        <div className="flex h-32 items-end gap-[2px]" role="img" aria-label={t("trendTitle")}>
          {report.trend.map((d) => (
            <div
              key={d.day}
              className="flex min-w-0 flex-1 flex-col justify-end rounded-t-xs bg-adm-fill-2"
              style={{ height: `${Math.max(2, (d.visits / maxDay) * 100)}%` }}
              title={`${dayLabel.format(new Date(d.day))} · ${num.format(d.visits)} (${t("legendAi")} ${num.format(d.ai)})`}
            >
              {d.ai > 0 && (
                <div className="rounded-t-xs bg-adm-strong" style={{ height: `${(d.ai / Math.max(1, d.visits)) * 100}%` }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-adm-muted">
          <span>{dayLabel.format(new Date(report.trend[0]?.day ?? report.since))}</span>
          <span>{dayLabel.format(new Date(report.trend.at(-1)?.day ?? report.since))}</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Channels */}
        <section className="admin-card overflow-x-auto p-0!">
          <h3 className="border-b border-adm-line px-5 py-3.5 text-sm font-semibold text-adm-text">{t("channelsTitle")}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
                <th className="px-5 py-2.5 font-medium">{t("channel")}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t("visits")}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t("clicks")}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t("clickRate")}</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.map((row) => (
                <tr key={row.channel} className="border-b border-adm-line last:border-b-0">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-adm-text">{channelName(row.channel)}</p>
                    <div className="mt-1 h-1 w-full rounded-full bg-adm-line">
                      <div
                        className={`h-1 rounded-full ${row.channel === "AI" ? "bg-adm-strong" : "bg-adm-muted"}`}
                        style={{ width: `${(row.visits / maxChannel) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{num.format(row.visits)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{num.format(row.clicks)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-adm-muted">{pct(row.clicks, row.visits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Contact clicks */}
        <section className="admin-card overflow-x-auto p-0!">
          <h3 className="border-b border-adm-line px-5 py-3.5 text-sm font-semibold text-adm-text">{t("actionsTitle")}</h3>
          {report.actions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-adm-muted">{t("noClicks")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
                  <th className="px-5 py-2.5 font-medium">{t("action")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("clicks")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("fromAi")}</th>
                </tr>
              </thead>
              <tbody>
                {report.actions.map((row) => (
                  <tr key={row.action} className="border-b border-adm-line last:border-b-0">
                    <td className="px-5 py-2.5 text-adm-text">{actionName(row.action)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{num.format(row.clicks)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-adm-muted">{num.format(row.aiClicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.clickPages.length > 0 && (
            <div className="border-t border-adm-line px-5 py-3">
              <p className="mb-1.5 text-xs font-medium text-adm-muted">{t("clickPagesTitle")}</p>
              <ul className="space-y-1 text-sm">
                {report.clickPages.map((row) => (
                  <li key={row.path} className="flex justify-between gap-3">
                    <span className="truncate text-adm-text">{row.path}</span>
                    <span className="tabular-nums text-adm-muted">{num.format(row.clicks)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Sources */}
      <section className="admin-card overflow-x-auto p-0!">
        <h3 className="border-b border-adm-line px-5 py-3.5 text-sm font-semibold text-adm-text">{t("sourcesTitle")}</h3>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
              <th className="px-5 py-2.5 font-medium">{t("source")}</th>
              <th className="px-5 py-2.5 font-medium">{t("channel")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("visits")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("clicks")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("clickRate")}</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-adm-muted">
                  {t("noData")}
                </td>
              </tr>
            ) : (
              report.sources.map((row) => (
                <tr key={row.source} className="border-b border-adm-line last:border-b-0">
                  <td className="px-5 py-2.5 font-medium text-adm-text">{sourceName(row.source)}</td>
                  <td className="px-5 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANNEL_TONE[row.channel]}`}>
                      {channelName(row.channel)}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{num.format(row.visits)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{num.format(row.clicks)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-adm-muted">{pct(row.clicks, row.visits)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* AI */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
          <Sparkles size={15} aria-hidden />
          {t("aiTitle")}
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="admin-card space-y-3">
            <div>
              <p className="text-sm font-semibold text-adm-text">{t("aiPeopleTitle")}</p>
              <p className="admin-hint">{t("aiPeopleHint")}</p>
            </div>
            {report.aiSources.length === 0 ? (
              <p className="text-sm text-adm-muted">{t("noAi")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.aiSources.map((row) => (
                  <li key={row.source} className="flex justify-between gap-3">
                    <span className="font-medium text-adm-text">{sourceName(row.source)}</span>
                    <span className="tabular-nums text-adm-muted">
                      {t("visitsClicks", { visits: num.format(row.visits), clicks: num.format(row.clicks) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {report.aiLanding.length > 0 && (
              <div className="border-t border-adm-line pt-3">
                <p className="mb-1.5 text-xs font-medium text-adm-muted">{t("aiLandingTitle")}</p>
                <ul className="space-y-1 text-sm">
                  {report.aiLanding.map((row) => (
                    <li key={row.path} className="flex justify-between gap-3">
                      <span className="truncate text-adm-text">{row.path}</span>
                      <span className="tabular-nums text-adm-muted">{num.format(row.visits)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="admin-card space-y-3">
            <div>
              <p className="text-sm font-semibold text-adm-text">{t("aiAgentsTitle")}</p>
              <p className="admin-hint">{t("aiAgentsHint")}</p>
            </div>
            {report.agents.length === 0 ? (
              <p className="text-sm text-adm-muted">{t("noAgents")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-adm-muted">
                    <th className="pb-1.5 font-medium">{t("agent")}</th>
                    <th className="pb-1.5 font-medium">{t("kind")}</th>
                    <th className="pb-1.5 text-right font-medium">{t("fetches")}</th>
                    <th className="pb-1.5 text-right font-medium">{t("pages")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.agents.map((row) => (
                    <tr key={row.bot}>
                      <td className="py-1 font-medium text-adm-text">{BOT_NAMES[row.bot] ?? row.bot}</td>
                      <td className="py-1 text-xs text-adm-muted">{t(`kinds.${row.kind}`)}</td>
                      <td className="py-1 text-right tabular-nums">{num.format(row.hits)}</td>
                      <td className="py-1 text-right tabular-nums text-adm-muted">{num.format(row.paths)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.agentPages.length > 0 && (
              <div className="border-t border-adm-line pt-3">
                <p className="mb-1.5 text-xs font-medium text-adm-muted">{t("agentPagesTitle")}</p>
                <ul className="space-y-1 text-sm">
                  {report.agentPages.map((row) => (
                    <li key={row.path} className="flex justify-between gap-3">
                      <span className="truncate text-adm-text">{row.path}</span>
                      <span className="tabular-nums text-adm-muted">{num.format(row.hits)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-adm-muted">{t("howCounted")}</p>
    </div>
  );
}
