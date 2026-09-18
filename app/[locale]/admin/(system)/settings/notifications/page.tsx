/**
 * app/[locale]/admin/settings/notifications/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "การแจ้งเตือน" — who gets told what, on which channel.
 *
 * The rows are NOTIFICATION_EVENTS from lib/notifications.ts, not a list
 * written here, so the table cannot drift from what the application
 * actually sends. Three of them need a scheduler this deployment does not
 * have; those render disabled with the reason rather than as switches that
 * would save a preference nothing could act on. See that file's header, and
 * the Redis row on the card to the right, which says the same thing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { isEmailConfigured } from "@/lib/email";
import { NOTIFICATION_EVENTS, getNotificationPrefs } from "@/lib/notifications";
import NotificationMatrix from "@/components/admin/NotificationMatrix";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminNotificationSettingsPage(props: Props) {
  const { locale } = await props.params;

  await requireAdmin(locale, Role.ADMIN);

  const [t, prefs] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getNotificationPrefs(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-primary">
          {t("settings.notifications.title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          {t("settings.notifications.subtitle")}
        </p>
      </header>

      <NotificationMatrix
        locale={locale}
        prefs={prefs}
        emailConfigured={isEmailConfigured()}
        rows={NOTIFICATION_EVENTS.map((event) => ({
          key: event.key,
          label: t(`settings.notifications.events.${event.key}`),
          needsScheduler: event.needsScheduler,
        }))}
        labels={{
          email: t("settings.notifications.email"),
          inApp: t("settings.notifications.inApp"),
          needsScheduler: t("settings.notifications.needsScheduler"),
          emailNotConfigured: t("settings.notifications.emailNotConfigured"),
          save: t("common.save"),
          saved: t("settings.notifications.saved"),
          error: t("common.error"),
          deliveryNote: t("settings.notifications.deliveryNote"),
        }}
      />
    </div>
  );
}
