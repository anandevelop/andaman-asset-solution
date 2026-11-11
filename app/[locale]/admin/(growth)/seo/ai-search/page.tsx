/**
 * /admin/seo/ai-search — "AI Search": how the AI assistants see the site.
 *
 *   - which AI crawlers came in the last 30 days (proxy.ts crawl log),
 *   - whether robots.txt lets them in (app/robots.ts allows every agent
 *     outside /admin and /api — stated here, not re-fetched),
 *   - /llms.txt, the map they can read (app/llms.txt/route.ts),
 *   - the structured data they lean on (links to the Schema tab).
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { Bot, CircleCheck, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { getCrawlOverview } from "@/lib/seo/crawl-report";
import { intlLocale } from "@/lib/format";
import { siteConfig } from "@/config/site";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

const AI_BOTS: { bot: string; name: string; owner: string }[] = [
  { bot: "gptbot", name: "GPTBot", owner: "OpenAI · ChatGPT" },
  { bot: "claudebot", name: "ClaudeBot", owner: "Anthropic · Claude" },
  { bot: "perplexitybot", name: "PerplexityBot", owner: "Perplexity" },
  { bot: "google-other", name: "Google-Other", owner: "Google · Gemini / AI Overviews" },
  { bot: "bytespider", name: "Bytespider", owner: "ByteDance" },
  { bot: "chatgpt-user", name: "ChatGPT-User", owner: "OpenAI · opened for a ChatGPT user" },
  { bot: "oai-searchbot", name: "OAI-SearchBot", owner: "OpenAI · ChatGPT search" },
  { bot: "claude-user", name: "Claude-User", owner: "Anthropic · opened for a Claude user" },
  { bot: "claude-searchbot", name: "Claude-SearchBot", owner: "Anthropic · Claude search" },
  { bot: "perplexity-user", name: "Perplexity-User", owner: "Perplexity · opened for a user" },
  { bot: "meta-externalagent", name: "Meta-ExternalAgent", owner: "Meta AI" },
  { bot: "amazonbot", name: "Amazonbot", owner: "Amazon · Alexa / Rufus" },
];

export default async function SeoAiSearchPage(props: Props) {
  const { locale } = await props.params;
  await requireAdmin(locale, Role.ADMIN);

  const [t, crawl] = await Promise.all([getTranslations({ locale, namespace: "admin.seo.aiSearch" }), getCrawlOverview(30)]);
  const date = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const byBot = new Map(crawl.activity.map((row) => [row.bot, row]));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="admin-label mb-0">{t("title")}</h2>
        <p className="admin-hint">{t("subtitle")}</p>
      </div>

      <section className="admin-card overflow-x-auto p-0!">
        <div className="border-b border-adm-line px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
            <Bot size={15} className="text-adm-accent-ink" aria-hidden />
            {t("crawlersTitle")}
          </h3>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-adm-line text-left text-xs text-adm-muted">
              <th className="px-5 py-2.5 font-medium">{t("crawler")}</th>
              <th className="px-5 py-2.5 font-medium">{t("robots")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("hits")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("pages")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {AI_BOTS.map(({ bot, name, owner }) => {
              const row = byBot.get(bot);
              return (
                <tr key={bot} className="border-b border-adm-line last:border-b-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-adm-text">{name}</p>
                    <p className="text-xs text-adm-muted">{owner}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-adm-success">
                      <CircleCheck size={13} aria-hidden />
                      {t("allowed")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{row?.hits ?? 0}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{row?.paths ?? 0}</td>
                  <td className="px-5 py-3 text-right text-xs text-adm-muted">
                    {row ? date.format(row.lastSeen) : t("never")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-adm-muted">{t("robotsNote")}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="admin-card space-y-2">
          <h3 className="text-sm font-semibold text-adm-text">llms.txt</h3>
          <p className="text-sm text-adm-muted">{t("llmsBody")}</p>
          <a
            href={`${siteConfig.url}/llms.txt`}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn-ghost admin-btn-sm w-fit"
          >
            {t("llmsOpen")} <ExternalLink size={11} aria-hidden />
          </a>
        </section>

        <section className="admin-card space-y-2">
          <h3 className="text-sm font-semibold text-adm-text">{t("checklistTitle")}</h3>
          <ul className="space-y-1.5 text-sm text-adm-text">
            {(["schema", "faq", "meta", "languages"] as const).map((key) => (
              <li key={key} className="flex items-start gap-2">
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-adm-success" aria-hidden />
                {t(`checklist.${key}`)}
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/admin/seo/schema`} className="admin-btn-ghost admin-btn-sm w-fit">
            {t("toSchema")}
          </Link>
        </section>
      </div>
    </div>
  );
}
