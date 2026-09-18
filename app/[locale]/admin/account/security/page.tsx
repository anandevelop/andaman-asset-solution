/**
 * app/[locale]/admin/account/security/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Two-factor authentication settings, and the page an ADMIN who has not
 * enrolled yet is redirected to before anything else in the back-office
 * opens (middleware.ts + lib/admin/guard.ts).
 *
 * The QR code is rendered to a data URI on the server. Sending the raw
 * secret to a client component that draws its own QR would put it in the
 * page payload twice; here the manual-entry secret is shown once, on
 * purpose, for people whose phone camera is not cooperating.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldCheck, ShieldAlert, History } from "lucide-react";
import QRCode from "qrcode";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { requiresTwoFactor } from "@/lib/totp";
import { countUnusedRecoveryCodes, startEnrolment } from "@/lib/two-factor";
import {
  AUTH_LOGIN,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_MODEL,
  AUTH_TOTP_FAILED,
  isFailedAuth,
} from "@/lib/audit/events";
import { intlLocale } from "@/lib/format";
import { confirmTwoFactor, disableTwoFactor, regenerateRecoveryCodes } from "./actions";
import TwoFactorSetup from "@/components/admin/TwoFactorSetup";
import TwoFactorManage from "@/components/admin/TwoFactorManage";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ setup?: string }>;
};

export const dynamic = "force-dynamic";

export default async function SecurityPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  /*
    The one page a pending account may open — that is the whole point of
    it. Role.VIEWER, not the requireAdmin() default of EDITOR: the old
    bare call rejected any VIEWER or SALES account on the role check
    *before* allowTwoFactorSetup ever got a say, so a fresh account below
    EDITOR could never reach the one page it is enrolled here specifically
    to redirect it to — bounced back to the dashboard, which sends a
    pending account straight back here, forever.
  */
  const actor = await requireAdmin(locale, Role.VIEWER, { allowTwoFactorSetup: true });

  const t = await getTranslations({ locale, namespace: "admin" });

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { totpEnabledAt: true },
  });

  const enabled = Boolean(user?.totpEnabledAt);
  const mandatory = requiresTwoFactor(actor.role);

  const enrolment = enabled ? null : await startEnrolment(actor.id, actor.email);
  const qr = enrolment
    ? await QRCode.toDataURL(enrolment.uri, { margin: 1, width: 240 })
    : null;
  const remaining = enabled ? await countUnusedRecoveryCodes(actor.id) : 0;

  /*
    This account's own recent arrivals, departures and refusals — the same
    AuditLog rows /admin/activity reads (SUPER_ADMIN only, every account),
    scoped here to one person so anybody can see it about themselves.
    Filtered by actorEmail rather than actorId for the same reason the
    activity page does: a failed sign-in against this address has no
    actorId at all, and it is precisely the row worth showing someone —
    "somebody tried your email and got it wrong".
  */
  const recentActivity = await safeQuery(
    "account:recentSignIns",
    () =>
      prisma.auditLog.findMany({
        where: { model: AUTH_MODEL, actorEmail: actor.email },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    [] as Awaited<ReturnType<typeof prisma.auditLog.findMany>>,
  );

  const activityFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const activityActionLabels: Record<string, string> = {
    [AUTH_LOGIN]: t("activity.actionLogin"),
    [AUTH_LOGOUT]: t("activity.actionLogout"),
    [AUTH_LOGIN_FAILED]: t("activity.actionLoginFailed"),
    [AUTH_TOTP_FAILED]: t("activity.actionTotpFailed"),
  };

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/account`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("account.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("security.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{t("security.subtitle")}</p>
      </header>

      {/* An empty sign-in history during an outage would read as "nobody
          has signed in", which on a security page is the alarming
          misreading of the two. */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* Redirected here by the enrolment gate — say why, once. */}
      {!enabled && mandatory && searchParams.setup === "1" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t("security.required", { role: t(`roles.${actor.role}` as never) })}</span>
        </div>
      )}

      <section className="admin-card">
        <div className="mb-5 flex items-start gap-3">
          <ShieldCheck
            size={20}
            className={enabled ? "mt-0.5 shrink-0 text-emerald-600" : "mt-0.5 shrink-0 text-ink-muted"}
            aria-hidden
          />
          <div>
            <h2 className="text-base font-semibold text-primary">
              {enabled ? t("security.statusOn") : t("security.statusOff")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {enabled
                ? t("security.remaining", { count: remaining })
                : t("security.statusOffHint")}
            </p>
          </div>
        </div>

        {enabled ? (
          <TwoFactorManage
            regenerateAction={regenerateRecoveryCodes.bind(null, locale)}
            disableAction={disableTwoFactor.bind(null, locale)}
            mandatory={mandatory}
          />
        ) : (
          <TwoFactorSetup
            action={confirmTwoFactor.bind(null, locale)}
            qrDataUri={qr!}
            secret={enrolment!.secret}
          />
        )}
      </section>

      <section className="admin-card">
        <div className="mb-5 flex items-start gap-3">
          <History size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-primary">
              {t("security.recentActivityTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t("security.recentActivitySubtitle")}</p>
          </div>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("security.recentActivityEmpty")}</p>
        ) : (
          <ul className="divide-y divide-primary/5">
            {recentActivity.map((entry) => {
              const failed = isFailedAuth(entry.action);

              return (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="w-44 shrink-0 text-ink-muted"
                  >
                    {activityFormatter.format(entry.createdAt)}
                  </time>

                  <span className={failed ? "font-medium text-red-700" : "font-medium text-ink"}>
                    {activityActionLabels[entry.action] ?? entry.action}
                  </span>

                  {failed && (
                    <span className="rounded-xs bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t("activity.unverified")}
                    </span>
                  )}

                  {entry.ipAddress && (
                    <span className="font-mono text-xs text-ink-muted">{entry.ipAddress}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
