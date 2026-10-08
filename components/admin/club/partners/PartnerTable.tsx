"use client";

/**
 * components/admin/club/partners/PartnerTable.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The mockup's refined partner table (`.ptbl`): grouped by category, the
 * benefit % edited in place (saved on blur / Enter), project chips that
 * toggle PartnerProject, a show switch, and a contact popover (`.pcpop`)
 * for the second phone, emails and website.
 *
 * Only SUPER_ADMIN / ADMIN get live controls; SALES sees the same table
 * read-only (per-house tweaks are in the unit drawer).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Clock, Copy, Globe, Home, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { parsePct, isValidPct } from "@/lib/club/benefits";
import { PARTNER_CATEGORIES } from "@/lib/club/constants";
import { setPartnerActive, setPartnerPct, togglePartnerProject } from "@/app/[locale]/admin/(club)/partners/actions";
import { CategoryIcon, PartnerAvatar, PctField, Switch, fmtDate } from "./ui";
import { useFlash } from "./Flash";

export type PartnerRow = {
  id: string;
  name: string;
  category: string;
  area: string | null;
  coverImage: string | null;
  discountPct: number | null;
  discountNote: string | null;
  phones: string[];
  emails: string[];
  website: string | null;
  contactName: string | null;
  isActive: boolean;
  projectIds: string[];
  overrideCount: number;
  trMissing: boolean;
  validity: { state: "open" | "ok" | "soon" | "expired" | "upcoming"; date: string | null; days: number | null };
};

export type TableProject = { id: string; code: string; name: string; residents: number };

const telHref = (n: string) => `tel:+66${n.replace(/\D/g, "").replace(/^0/, "")}`;
const webShort = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

type ContactItem = { kind: "phone" | "email" | "website"; value: string; href: string; label: string };

export default function PartnerTable({
  locale,
  rows,
  projects,
  filter,
  canEdit,
  editHref,
}: {
  locale: string;
  rows: PartnerRow[];
  projects: TableProject[];
  filter: string;
  canEdit: boolean;
  /** `?…&edit=` — the id is appended. */
  editHref: string;
}) {
  const t = useTranslations("clubPartners");
  const router = useRouter();
  const [flash, show] = useFlash();
  const [pending, startTransition] = useTransition();
  const [popover, setPopover] = useState<string | null>(null);

  const run = (task: () => Promise<{ ok: boolean; error?: string; cap?: number; count?: number }>, success?: (r: { count?: number }) => string) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        const key = result.error ?? "generic";
        show(
          key === "atLeastOne"
            ? t("projects.atLeastOne")
            : t.has(`errors.${key}`)
              ? t(`errors.${key}` as never, { cap: result.cap ?? 0 } as never)
              : t("errors.generic"),
          "error",
        );
        return;
      }
      if (success) show(success(result));
      router.refresh();
    });

  return (
    <>
      {flash}
      <div className="admin-card overflow-x-auto p-0!">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr>
              <th className="admin-th">{t("table.partner")}</th>
              <th className="admin-th">{t("table.contact")}</th>
              <th className="admin-th">
                {t("table.benefit")} <span className="font-normal text-adm-muted">{t("table.benefitSub")}</span>
              </th>
              <th className="admin-th">{t("table.projects")}</th>
              <th className="admin-th text-center!">{t("table.show")}</th>
              <th className="admin-th" aria-label={t("form.titleEdit")} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-td py-10 text-center text-adm-muted">
                  {t("table.empty")}
                </td>
              </tr>
            )}
            {PARTNER_CATEGORIES.map((cat) => {
              const inCat = rows.filter((row) => row.category === cat.key);
              if (!inCat.length) return null;
              return [
                <tr key={`cat-${cat.key}`}>
                  <td
                    colSpan={6}
                    className="border-b border-adm-line px-4 pb-1.5 pt-[18px] text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryIcon category={cat.key} size={13} />
                      {t(`cat.${cat.key}` as never)}
                      <span className="ml-1 font-normal">{inCat.length}</span>
                    </span>
                  </td>
                </tr>,
                ...inCat.map((row) => (
                  <Row
                    key={`${row.id}:${row.discountPct ?? ""}`}
                    row={row}
                    locale={locale}
                    projects={projects}
                    filter={filter}
                    canEdit={canEdit}
                    busy={pending}
                    editHref={`${editHref}${row.id}`}
                    popover={popover}
                    setPopover={setPopover}
                    onPct={(raw) => {
                      const pct = parsePct(raw);
                      if (pct === row.discountPct) return true;
                      if (pct !== null && !isValidPct(pct)) {
                        show(t("benefit.invalid"), "error");
                        return false;
                      }
                      run(
                        () => setPartnerPct(locale, row.id, raw),
                        (r) =>
                          pct === null
                            ? t("benefit.cleared")
                            : r.count
                              ? `${t("benefit.saved", { pct })} · ${t("benefit.lowered", { count: r.count, pct })}`
                              : t("benefit.saved", { pct }),
                      );
                      return true;
                    }}
                    onProject={(projectId) => run(() => togglePartnerProject(locale, row.id, projectId))}
                    onActive={() =>
                      run(
                        () => setPartnerActive(locale, row.id, !row.isActive),
                        () => (row.isActive ? t("show.hidden", { name: row.name }) : t("show.shown", { name: row.name })),
                      )
                    }
                    onCopied={() => show(t("contact.copied"))}
                  />
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({
  row,
  locale,
  projects,
  filter,
  canEdit,
  busy,
  editHref,
  popover,
  setPopover,
  onPct,
  onProject,
  onActive,
  onCopied,
}: {
  row: PartnerRow;
  locale: string;
  projects: TableProject[];
  filter: string;
  canEdit: boolean;
  busy: boolean;
  editHref: string;
  popover: string | null;
  setPopover: (key: string | null) => void;
  onPct: (raw: string) => boolean;
  onProject: (projectId: string) => void;
  onActive: () => void;
  onCopied: () => void;
}) {
  const t = useTranslations("clubPartners");
  // Keyed by id + saved value in the parent, so a fresh save resets this.
  const [value, setValue] = useState(row.discountPct ? String(row.discountPct) : "");

  const dim = !(row.isActive && (filter === "all" || row.projectIds.includes(filter)));
  const [mainPhone, ...otherPhones] = row.phones;
  const more: ContactItem[] = [
    ...otherPhones.map((n) => ({ kind: "phone" as const, value: n, href: telHref(n), label: t("contact.phone") })),
    ...row.emails.map((m) => ({ kind: "email" as const, value: m, href: `mailto:${m}`, label: t("contact.email") })),
    ...(row.website ? [{ kind: "website" as const, value: row.website, href: row.website, label: t("contact.website") }] : []),
  ];

  const commit = () => {
    if (!onPct(value)) setValue(row.discountPct ? String(row.discountPct) : "");
  };

  const td = "border-b border-adm-line px-3.5 py-3 align-middle text-sm text-adm-text";
  return (
    <tr className={`group hover:bg-adm-text/[0.025] ${dim ? "[&>td]:opacity-45" : ""}`}>
      <td className={td}>
        <div className="flex min-w-[220px] items-center gap-3">
          <PartnerAvatar category={row.category} cover={row.coverImage} />
          <span className="min-w-0">
            <b className="block text-[13.5px] font-semibold">
              {canEdit ? (
                <Link href={editHref} scroll={false} className="hover:underline">
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
            </b>
            <small className="mt-0.5 flex items-center gap-1 text-[11.5px] text-adm-muted">
              <MapPin size={11} aria-hidden />
              {row.area || "—"}
            </small>
          </span>
        </div>
      </td>

      <td className={td}>
        <div className="relative flex min-w-[170px] flex-col gap-[3px]">
          {mainPhone ? (
            <a href={telHref(mainPhone)} className="text-[13px] font-medium tabular-nums hover:underline">
              {mainPhone}
            </a>
          ) : (
            <small className="text-[11px] text-adm-muted">{t("table.noContact")}</small>
          )}
          {row.contactName && <small className="text-[11px] text-adm-muted">{row.contactName}</small>}
          {more.length > 0 && (
            <span className="mt-[3px] flex gap-1">
              {more.map((item, k) => {
                const key = `${row.id}|${k}`;
                const Icon = item.kind === "phone" ? Phone : item.kind === "email" ? Mail : Globe;
                return (
                  <button
                    key={key}
                    type="button"
                    title={item.kind === "website" ? webShort(item.value) : item.value}
                    aria-label={`${item.label}: ${item.value}`}
                    aria-expanded={popover === key}
                    onClick={() => setPopover(popover === key ? null : key)}
                    className={`grid h-[26px] w-[26px] place-items-center rounded-[7px] border text-adm-muted transition-colors hover:border-adm-muted hover:text-adm-text ${
                      popover === key ? "border-adm-muted bg-adm-text/5 text-adm-text" : "border-adm-line bg-adm-panel"
                    }`}
                  >
                    <Icon size={13} aria-hidden />
                  </button>
                );
              })}
            </span>
          )}
          {more.map((item, k) =>
            popover === `${row.id}|${k}` ? (
              <ContactPopover key={k} item={item} onClose={() => setPopover(null)} onCopied={onCopied} />
            ) : null,
          )}
        </div>
      </td>

      <td className={td}>
        <div className="flex flex-col items-start gap-[5px]">
          <PctField
            prefix={t("benefit.off")}
            tone={value ? "default" : "empty"}
            title={t("benefit.hint")}
            inputProps={{
              value,
              placeholder: t("benefit.placeholder"),
              disabled: !canEdit || busy,
              "aria-label": t("benefit.pctLabel", { name: row.name }),
              onChange: (event) => setValue(event.target.value),
              onBlur: commit,
              onKeyDown: (event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                if (event.key === "Escape") setValue(row.discountPct ? String(row.discountPct) : "");
              },
            }}
          />
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-adm-muted">
            {row.discountPct ? (
              row.discountNote && <span>{row.discountNote}</span>
            ) : (
              <span className="rounded-full bg-adm-text/5 px-2 py-px">{t("benefit.comingSoon")}</span>
            )}
            {row.overrideCount > 0 && (
              <span className="inline-flex items-center gap-1" title={t("benefit.perHouseTitle")}>
                <Home size={11} aria-hidden />
                {t("benefit.perHouse", { count: row.overrideCount })}
              </span>
            )}
            {row.trMissing && (
              <span className="inline-flex items-center gap-1 text-adm-warning" title={t("benefit.trMissingTitle")}>
                <Globe size={11} aria-hidden />
                {t("benefit.trMissing")}
              </span>
            )}
          </div>
          <ValidityLine validity={row.validity} locale={locale} />
        </div>
      </td>

      <td className={td}>
        <div role="group" aria-label={t("projects.label", { name: row.name })} className="inline-flex rounded-[9px] border border-adm-line bg-adm-text/5 p-[2px]">
          {projects.map((project) => {
            const on = row.projectIds.includes(project.id);
            const effective = row.isActive && on;
            return (
              <button
                key={project.id}
                type="button"
                aria-pressed={on}
                disabled={!canEdit || !row.isActive || busy}
                onClick={() => onProject(project.id)}
                title={t(on ? "projects.on" : "projects.off", { project: project.name, count: project.residents })}
                className={[
                  "rounded-[7px] px-[9px] py-1 text-[11px] font-semibold tracking-[0.04em] disabled:cursor-not-allowed",
                  effective
                    ? "bg-adm-panel text-adm-text no-underline shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--adm-line)]"
                    : "text-adm-muted line-through decoration-adm-text/25",
                  filter === project.id ? "ring-[1.5px] ring-adm-accent-ink" : "",
                ].join(" ")}
              >
                {project.code}
              </button>
            );
          })}
        </div>
      </td>

      <td className={`${td} text-center`}>
        <Switch
          small
          checked={row.isActive}
          label={t("show.label", { name: row.name })}
          title={row.isActive ? t("show.on") : t("show.off")}
          disabled={!canEdit || busy}
          onClick={onActive}
        />
      </td>

      <td className={`${td} text-right`}>
        {canEdit && (
          <Link href={editHref} scroll={false} className="admin-btn-quiet admin-btn-sm" aria-label={t("table.edit", { name: row.name })} title={t("table.edit", { name: row.name })}>
            <Pencil size={15} aria-hidden />
          </Link>
        )}
      </td>
    </tr>
  );
}

export function ValidityLine({ validity, locale }: { validity: PartnerRow["validity"]; locale: string }) {
  const t = useTranslations("clubPartners");
  const date = fmtDate(validity.date, locale);
  if (validity.state === "expired")
    return (
      <div className="flex items-center gap-1 text-[11px] text-adm-danger">
        <Clock size={11} aria-hidden /> {t("validity.expired", { date })}
      </div>
    );
  if (validity.state === "upcoming")
    return (
      <div className="flex items-center gap-1 text-[11px] text-adm-status-info">
        <Clock size={11} aria-hidden /> {t("validity.upcoming", { date })}
      </div>
    );
  if (validity.state === "soon")
    return (
      <div className="flex items-center gap-1 text-[11px] text-adm-warning">
        <Clock size={11} aria-hidden /> {t("validity.soon", { days: validity.days ?? 0, date })}
      </div>
    );
  if (validity.state === "ok" && validity.date) return <div className="text-[11px] text-adm-muted">{t("validity.until", { date })}</div>;
  return null;
}

function ContactPopover({ item, onClose, onCopied }: { item: ContactItem; onClose: () => void; onCopied: () => void }) {
  const t = useTranslations("clubPartners");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest("[aria-expanded='true']")) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const Icon = item.kind === "phone" ? Phone : item.kind === "email" ? Mail : Globe;
  const action = item.kind === "phone" ? t("contact.call") : item.kind === "email" ? t("contact.sendEmail") : t("contact.open");

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={item.label}
      className="absolute left-0 top-full z-30 mt-1.5 min-w-[240px] max-w-[340px] rounded-xl border border-adm-line bg-adm-solid px-3.5 py-3 shadow-[var(--adm-shadow-float)]"
    >
      <small className="flex items-center gap-1.5 text-[11px] text-adm-muted">
        <Icon size={12} aria-hidden /> {item.label}
      </small>
      <b className="mb-2.5 mt-1 block select-all break-all text-sm font-semibold text-adm-text">{item.value}</b>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="admin-btn-ghost admin-btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(item.value);
              onCopied();
            } catch {
              /* clipboard blocked — the value is selectable */
            }
          }}
        >
          <Copy size={13} aria-hidden /> {t("contact.copy")}
        </button>
        <a
          href={item.href}
          className="admin-btn-ghost admin-btn-sm"
          {...(item.kind === "website" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          <Icon size={13} aria-hidden /> {action}
        </a>
      </div>
    </div>
  );
}
