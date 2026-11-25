/**
 * app/[locale]/admin/(company)/careers/positions/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * What the public "Join our team" section says: the positions on offer,
 * and below them the invitation's wording, how long applications are kept
 * and which mailbox receives them.
 *
 * A position is written in all four languages on one form — the fields
 * are three short ones, and HR adding a vacancy should not have to save
 * four times. A language left blank falls back on the site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, BriefcaseBusiness, Pencil, Plus } from "lucide-react";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { requireCapability } from "@/lib/admin/guard";
import { zoneEyebrow } from "@/lib/admin/nav";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { getCareersConfig } from "@/lib/careers/config";
import { EMPLOYMENT_TYPES, RETENTION_CHOICES } from "@/lib/careers/fields";
import { listPositions, type AdminPosition } from "@/lib/careers/positions";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import StatusPill from "@/components/admin/ui/StatusPill";
import PageTabs from "@/components/admin/PageTabs";
import DeleteUserForm from "@/components/admin/DeleteUserForm";
import {
  deletePositionAction,
  movePositionAction,
  saveCareersSettingsAction,
  savePositionAction,
  togglePositionAction,
} from "../actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ edit?: string; saved?: string; error?: string }>;
};

const LANGUAGE_NAME: Record<(typeof LOCALE_DISPLAY_ORDER)[number], string> = {
  th: "ไทย",
  en: "English",
  zh: "中文",
  ru: "Русский",
};

export default async function AdminCareersPositionsPage(props: Props) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;

  const session = await requireCapability(locale, "manageCareers");
  const t = await getTranslations({ locale, namespace: "admin" });
  const tTypes = await getTranslations({ locale, namespace: "careers.types" });

  const [positions, config] = await Promise.all([
    safeQuery("admin:careers:positions", () => listPositions(), [] as AdminPosition[]),
    getCareersConfig(),
  ]);

  const base = `/${locale}/admin/careers/positions`;
  const titleOf = (position: AdminPosition) =>
    position.translations[locale as keyof AdminPosition["translations"]]?.title ||
    position.translations.en?.title ||
    position.translations.th?.title ||
    LOCALE_DISPLAY_ORDER.map((code) => position.translations[code]?.title).find(Boolean) ||
    t("careers.positions.noTitle");

  const editing: "new" | AdminPosition | null =
    searchParams.edit === "new" ? "new" : (positions.find((position) => position.id === searchParams.edit) ?? null);
  const editingRow = editing === "new" ? null : editing;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "careers")}
        title={t("careers.positions.title")}
        description={t("careers.positions.subtitle")}
        actions={
          <Link href={`${base}?edit=new`} scroll={false} className="admin-btn">
            <Plus size={15} aria-hidden />
            {t("careers.positions.add")}
          </Link>
        }
      />

      <PageTabs locale={locale} role={session.role} groupKey="careers" />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      {searchParams.saved && (
        <p role="status" className="rounded-xs border border-adm-success/30 bg-adm-success-bg px-4 py-3 text-sm text-adm-success">
          {t("careers.positions.saved")}
        </p>
      )}

      <section className="admin-card p-0!">
        {positions.length === 0 ? (
          <p className="flex items-start gap-2 px-5 py-10 text-sm text-adm-muted">
            <BriefcaseBusiness size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t("careers.positions.empty")}
          </p>
        ) : (
          <ul>
            {positions.map((position, index) => {
              const title = titleOf(position);
              return (
                <li
                  key={position.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-adm-line px-5 py-4 last:border-b-0"
                >
                  <div className="flex shrink-0 flex-col">
                    <form action={movePositionAction.bind(null, locale, position.id, "up")}>
                      <button
                        type="submit"
                        disabled={index === 0}
                        aria-label={t("careers.positions.moveUp", { title })}
                        className="admin-btn-quiet admin-btn-sm disabled:opacity-30"
                      >
                        <ArrowUp size={14} aria-hidden />
                      </button>
                    </form>
                    <form action={movePositionAction.bind(null, locale, position.id, "down")}>
                      <button
                        type="submit"
                        disabled={index === positions.length - 1}
                        aria-label={t("careers.positions.moveDown", { title })}
                        className="admin-btn-quiet admin-btn-sm disabled:opacity-30"
                      >
                        <ArrowDown size={14} aria-hidden />
                      </button>
                    </form>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-adm-text">
                      {title}
                      <StatusPill
                        tone={position.isOpen ? "success" : "neutral"}
                        label={t(position.isOpen ? "careers.positions.open" : "careers.positions.closed")}
                      />
                    </p>
                    <p className="mt-0.5 text-xs text-adm-muted">
                      {tTypes(position.employmentType)} ·{" "}
                      {t("careers.positions.applications", { count: position.applications })} ·{" "}
                      {LOCALE_DISPLAY_ORDER.filter((code) => position.translations[code]?.title)
                        .map((code) => code.toUpperCase())
                        .join(" ")}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <form action={togglePositionAction.bind(null, locale, position.id, !position.isOpen)}>
                      <button type="submit" className="admin-btn-ghost admin-btn-sm">
                        {t(position.isOpen ? "careers.positions.closeAction" : "careers.positions.openAction")}
                      </button>
                    </form>
                    <Link href={`${base}?edit=${position.id}`} scroll={false} className="admin-btn-ghost admin-btn-sm">
                      <Pencil size={13} aria-hidden />
                      {t("common.edit")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Invitation wording and settings ─────────────────────────────── */}
      <section id="settings" className="admin-card scroll-mt-24">
        <h2 className="text-[15px] font-semibold text-adm-text">{t("careers.settings.title")}</h2>

        <form action={saveCareersSettingsAction.bind(null, locale)} className="mt-5 space-y-6">
          <div>
            <p className="admin-hint mt-0!">{t("careers.settings.copyHint")}</p>
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              {LOCALE_DISPLAY_ORDER.map((code) => (
                <fieldset key={code} className="rounded-xs border border-adm-line p-4">
                  <legend className="px-1.5 text-xs font-medium text-adm-muted">{LANGUAGE_NAME[code]}</legend>
                  <label className="admin-label" htmlFor={`inviteTitle-${code}`}>
                    {t("careers.settings.inviteTitle")}
                  </label>
                  <input
                    id={`inviteTitle-${code}`}
                    name={`inviteTitle.${code}`}
                    lang={code}
                    maxLength={160}
                    defaultValue={config.copy[code]?.title ?? ""}
                    className="admin-input"
                  />
                  <label className="admin-label mt-3" htmlFor={`inviteIntro-${code}`}>
                    {t("careers.settings.inviteIntro")}
                  </label>
                  <textarea
                    id={`inviteIntro-${code}`}
                    name={`inviteIntro.${code}`}
                    lang={code}
                    maxLength={800}
                    rows={3}
                    defaultValue={config.copy[code]?.intro ?? ""}
                    className="admin-textarea"
                  />
                </fieldset>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="admin-label" htmlFor="retentionMonths">
                {t("careers.settings.retention")}
              </label>
              <select
                id="retentionMonths"
                name="retentionMonths"
                defaultValue={config.retentionMonths}
                className="admin-input w-auto!"
              >
                {RETENTION_CHOICES.map((months) => (
                  <option key={months} value={months}>
                    {t("careers.settings.retentionOption", { months })}
                  </option>
                ))}
              </select>
              <p className="admin-hint">{t("careers.settings.retentionHint")}</p>
            </div>

            <div>
              <label className="admin-label" htmlFor="notifyEmail">
                {t("careers.settings.notifyEmail")}
              </label>
              <input
                id="notifyEmail"
                name="notifyEmail"
                type="email"
                required
                maxLength={160}
                defaultValue={config.notifyEmail}
                aria-invalid={searchParams.error === "email" ? true : undefined}
                aria-describedby="notifyEmail-hint"
                className="admin-input"
              />
              <p id="notifyEmail-hint" className="admin-hint">
                {searchParams.error === "email" ? (
                  <span className="text-adm-danger">{t("careers.settings.emailInvalid")}</span>
                ) : (
                  t("careers.settings.notifyEmailHint")
                )}
              </p>
              <p className="admin-hint">{t("careers.settings.lineHint")}</p>
            </div>
          </div>

          <button type="submit" className="admin-btn">
            {t("careers.settings.save")}
          </button>
        </form>
      </section>

      {editing && (
        <AdminDrawer
          title={editingRow ? t("careers.positions.edit") : t("careers.positions.new")}
          icon={<BriefcaseBusiness size={16} aria-hidden />}
          closeHref={base}
          closeLabel={t("common.cancel")}
        >
          <form action={savePositionAction.bind(null, locale, editingRow?.id ?? null)} className="space-y-5 text-sm">
            {searchParams.error === "title" && (
              <p role="alert" className="rounded-xs border border-adm-danger/30 bg-adm-danger-bg px-3 py-2 text-adm-danger">
                {t("careers.positions.titleRequired")}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="admin-label" htmlFor="employmentType">
                  {t("careers.positions.type")}
                </label>
                <select
                  id="employmentType"
                  name="employmentType"
                  defaultValue={editingRow?.employmentType ?? "full_time"}
                  className="admin-input"
                >
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tTypes(type)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2.5 self-end pb-1">
                <input
                  type="checkbox"
                  name="isOpen"
                  defaultChecked={editingRow ? editingRow.isOpen : true}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block text-adm-text">{t("careers.positions.isOpen")}</span>
                  <span className="block text-xs text-adm-muted">{t("careers.positions.isOpenHint")}</span>
                </span>
              </label>
            </div>

            <p className="admin-hint">{t("careers.positions.languageNote")}</p>

            {LOCALE_DISPLAY_ORDER.map((code) => {
              const row = editingRow?.translations[code];
              return (
                <fieldset key={code} className="rounded-xs border border-adm-line p-4">
                  <legend className="px-1.5 text-xs font-medium text-adm-muted">{LANGUAGE_NAME[code]}</legend>
                  <label className="admin-label" htmlFor={`title-${code}`}>
                    {t("careers.positions.fieldTitle")}
                  </label>
                  <input
                    id={`title-${code}`}
                    name={`title.${code}`}
                    lang={code}
                    maxLength={160}
                    defaultValue={row?.title ?? ""}
                    className="admin-input"
                  />
                  <label className="admin-label mt-3" htmlFor={`location-${code}`}>
                    {t("careers.positions.location")}
                  </label>
                  <input
                    id={`location-${code}`}
                    name={`location.${code}`}
                    lang={code}
                    maxLength={160}
                    defaultValue={row?.location ?? ""}
                    className="admin-input"
                  />
                  <label className="admin-label mt-3" htmlFor={`summary-${code}`}>
                    {t("careers.positions.summary")}
                  </label>
                  <textarea
                    id={`summary-${code}`}
                    name={`summary.${code}`}
                    lang={code}
                    maxLength={1200}
                    rows={3}
                    defaultValue={row?.summary ?? ""}
                    aria-describedby={`summary-${code}-hint`}
                    className="admin-textarea"
                  />
                  <p id={`summary-${code}-hint`} className="admin-hint">
                    {t("careers.positions.summaryHint")}
                  </p>
                </fieldset>
              );
            })}

            <button type="submit" className="admin-btn">
              {t("careers.positions.save")}
            </button>
          </form>

          {editingRow && (
            <div className="mt-8 border-t border-adm-line pt-5">
              <DeleteUserForm
                action={deletePositionAction.bind(null, locale, editingRow.id)}
                label={t("careers.positions.delete")}
                confirmLabel={t("careers.positions.deleteConfirm", { title: titleOf(editingRow) })}
              />
            </div>
          )}
        </AdminDrawer>
      )}
    </div>
  );
}
