/**
 * app/[locale]/admin/settings/system/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ระบบและการสำรองข้อมูล" — what this container is, whether its environment
 * is complete, and how much data it is holding.
 *
 * Almost entirely read-only, and deliberately so. Every section but one is
 * either a fact about the running process or a count from the database —
 * not a setting, because nothing there can be changed without a deploy.
 *
 * THE BACKUP SECTION DOES NOT OFFER A BACKUP BUTTON
 *
 * This application does not take backups and cannot: they are the database
 * host's job, run outside the container on a schedule this process knows
 * nothing about. A "back up now" button would either do nothing or take a
 * dump inside a container whose disk disappears on the next deploy. So the
 * section states where the responsibility actually sits and what to check,
 * which is the honest and more useful thing.
 *
 * THE CACHE SECTION IS THE ONE EXCEPTION
 *
 * clearSiteCache() runs in this process, right now, no deploy involved —
 * a manual escape hatch for whatever a normal save's own revalidatePath
 * call can't reach: a bulk script that wrote through Prisma directly, or
 * a page that still looks stale for a reason specific to it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, Database, HardDrive, Info } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { collectEnvProblems } from "@/lib/env";
import { formatGigabytes, getSystemHealth } from "@/lib/admin/system-health";
import ClearCacheButton from "@/components/admin/ClearCacheButton";
import { clearSiteCache } from "./actions";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminSystemSettingsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, health, counts] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getSystemHealth(),
    safeQuery(
      "settings:system:counts",
      async () => {
        const [leads, media, projects, articles, audit] = await Promise.all([
          prisma.leadInquiry.count(),
          prisma.media.count(),
          prisma.project.count({ where: { deletedAt: null } }),
          prisma.newsArticle.count({ where: { deletedAt: null } }),
          prisma.auditLog.count(),
        ]);
        return { leads, media, projects, articles, audit };
      },
      { leads: 0, media: 0, projects: 0, articles: 0, audit: 0 },
    ),
  ]);

  const env = collectEnvProblems();
  const offline = isDatabaseOffline();

  // "dev" rather than blank when unset — see the same read on the login
  // page for why an image built without the build argument must be
  // distinguishable from one whose stamp went missing.
  const version = process.env.APP_VERSION || "dev";

  const facts = [
    { key: "version", label: t("settings.system.version"), value: version },
    {
      key: "database",
      label: t("settings.system.database"),
      value: offline ? t("settings.system.databaseOffline") : t("settings.system.databaseOnline"),
      bad: offline,
    },
    { key: "node", label: t("settings.system.runtime"), value: process.version },
  ];

  const volumes = [
    { key: "leads", label: t("settings.system.volumeLeads"), value: counts.leads },
    { key: "projects", label: t("settings.system.volumeProjects"), value: counts.projects },
    { key: "articles", label: t("settings.system.volumeArticles"), value: counts.articles },
    { key: "audit", label: t("settings.system.volumeAudit"), value: counts.audit },
    { key: "media", label: t("settings.system.volumeMedia"), value: counts.media },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-primary">{t("settings.groups.system")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("settings.system.subtitle")}</p>
      </header>

      {/* The counts below all read 0 during an outage, which looks like an
          empty database rather than an unreachable one. */}
      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <section className="admin-card space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Database size={15} aria-hidden />
          {t("settings.system.buildTitle")}
        </h3>

        <dl className="space-y-2 text-sm">
          {facts.map((fact) => (
            <div key={fact.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">{fact.label}</dt>
              <dd
                className={`font-mono text-xs ${fact.bad ? "font-semibold text-red-700" : "text-primary"}`}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The environment check that instrumentation.ts runs at boot, shown
          where somebody can act on it rather than only in a container log. */}
      <section className="admin-card space-y-3">
        <h3 className="text-sm font-semibold text-primary">{t("settings.system.envTitle")}</h3>

        {env.fatal.length === 0 && env.warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 size={15} aria-hidden />
            {t("settings.system.envOk")}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {env.fatal.map((problem) => (
              <li key={problem.name} className="flex items-start gap-2 text-red-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  <code className="font-mono text-xs">{problem.name}</code> {problem.detail}
                </span>
              </li>
            ))}
            {env.warnings.map((problem) => (
              <li key={problem.name} className="flex items-start gap-2 text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  <code className="font-mono text-xs">{problem.name}</code> — {problem.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <HardDrive size={15} aria-hidden />
          {t("settings.system.volumeTitle")}
        </h3>

        <dl className="space-y-2 text-sm">
          {volumes.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">{row.label}</dt>
              <dd className="font-medium tabular-nums text-primary">{row.value.toLocaleString()}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-primary/10 pt-2">
            <dt className="text-ink-muted">{t("settings.system.volumeStorage")}</dt>
            <dd className="font-medium tabular-nums text-primary">
              {t("settings.system.gigabytes", { gb: formatGigabytes(health.storageBytes) })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="admin-card space-y-3">
        <h3 className="text-sm font-semibold text-primary">{t("settings.system.backupTitle")}</h3>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
          <Info size={15} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
          {t("settings.system.backupNote")}
        </p>
      </section>

      <section className="admin-card space-y-3">
        <h3 className="text-sm font-semibold text-primary">{t("settings.system.cacheTitle")}</h3>
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
          <Info size={15} className="mt-0.5 shrink-0 text-accent-700" aria-hidden />
          {t("settings.system.cacheNote")}
        </p>
        <ClearCacheButton
          action={clearSiteCache}
          label={t("settings.system.cacheButton")}
          successLabel={t("settings.system.cacheSuccess")}
          errorLabel={t("settings.system.cacheError")}
        />
      </section>
    </div>
  );
}
