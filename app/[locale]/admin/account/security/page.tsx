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
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { requiresTwoFactor } from "@/lib/totp";
import { countUnusedRecoveryCodes, startEnrolment } from "@/lib/two-factor";
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

  // The one page a pending account may open — that is the whole point of it.
  const actor = await requireAdmin(locale, undefined, { allowTwoFactorSetup: true });

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

      {/* Redirected here by the enrolment gate — say why, once. */}
      {!enabled && mandatory && searchParams.setup === "1" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
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
    </div>
  );
}
