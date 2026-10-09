/**
 * app/[locale]/admin/(club)/residents/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * ยูนิต & ลูกบ้าน — every unit of the ANDAMAN CLUB projects, who lives in
 * the handed-over ones, and where each house's card is.
 *
 * URL state (all optional, so any view is a shareable link):
 *   ?project=<id>     project tab (projects with a cardCode only)
 *   ?view=list        residents table instead of the unit grid
 *   ?status=<STATUS>  dims other tiles on the grid
 *   ?code=<house>     backup house-code lookup (side card)
 *   ?codes=1          show full house codes in the table
 *   ?unit=<id>        the unit drawer; &panel=resale for the resale form
 *
 * SALES and up (layout). ADMIN+ also gets the project QR ZIP, reissue,
 * device sign-out and resale — the actions re-check, this only hides.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Download, Grid3x3, KeyRound, Search, Users } from "lucide-react";
import { Role, type UnitStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { zoneEyebrow } from "@/lib/admin/nav";
import { maskPhone } from "@/lib/contact-mask";
import { formatNumber } from "@/lib/format";
import { projectName } from "@/lib/club/portal";
import {
  UNIT_STATUSES,
  clubProjects,
  countByStatus,
  daysSince,
  findByHouseCode,
  projectBoard,
  reservationExpiringSoon,
  tileName,
  unitDetail,
} from "@/lib/club/admin-residents";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminTabs from "@/components/admin/ui/AdminTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import Segmented from "@/components/admin/ui/Segmented";
import Link from "next/link";
import UnitBoard, { STATUS_DOT, type BoardGroup } from "@/components/admin/club/residents/UnitBoard";
import ResidentsTable, { type ResidentRow } from "@/components/admin/club/residents/ResidentsTable";
import UnitDrawerBody from "@/components/admin/club/residents/UnitDrawerBody";
import DownloadLink from "@/components/admin/club/residents/DownloadLink";

type SearchParams = {
  project?: string;
  view?: string;
  status?: string;
  code?: string;
  codes?: string;
  unit?: string;
  panel?: string;
};

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> };

const isStatus = (value: string | undefined): value is UnitStatus => UNIT_STATUSES.includes(value as UnitStatus);

export default async function AdminResidentsPage(props: Props) {
  const { locale } = await props.params;
  const sp = await props.searchParams;
  const session = await requireAdmin(locale, Role.SALES);
  const isAdmin = hasRole(session.role, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "clubResidents" });
  const tAdmin = await getTranslations({ locale, namespace: "admin" });
  const base = `/${locale}/admin/residents`;
  const eyebrow = zoneEyebrow((key) => tAdmin(key as never), "clubResidents");

  const projects = await clubProjects();
  if (projects.length === 0) {
    return (
      <div>
        <AdminPageHeader eyebrow={eyebrow} title={t("title")} description={t("subtitle")} />
        <div className="admin-card text-sm text-adm-muted">{t("noProjects")}</div>
      </div>
    );
  }

  const project = projects.find((p) => p.id === sp.project) ?? projects[0];
  const view = sp.view === "list" ? "list" : "map";
  const filter = isStatus(sp.status) ? sp.status : null;
  const showCodes = sp.codes === "1";

  /** Current URL state with overrides; null drops a key. */
  const href = (patch: Partial<Record<keyof SearchParams, string | null>>) => {
    const state: Record<string, string | null | undefined> = {
      project: project.id,
      view: view === "list" ? "list" : null,
      status: filter,
      codes: showCodes ? "1" : null,
      code: sp.code ?? null,
      ...patch,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v) q.set(k, v);
    return `${base}?${q.toString()}`;
  };

  const { types, units } = await projectBoard(project.id);
  const counts = countByStatus(units);
  const transferred = units.filter((u) => u.status === "TRANSFERRED" && u.resident);
  const residentsWithCard = transferred.filter((u) => u.resident!.cards.length > 0).length;
  const portalUsers = transferred.filter((u) => u.resident!.lastLoginAt).length;
  const handed = transferred.filter((u) => u.resident!.cards[0]?.status === "HANDED").length;
  const waiting = transferred.filter((u) => u.resident!.cards[0]?.status === "PRINTED").length;
  const soldCount = counts.SOLD + counts.TRANSFERRED;
  const value = units.filter((u) => u.status !== "AVAILABLE").reduce((sum, u) => sum + Number(u.priceTHB ?? 0), 0);
  const pName = projectName(project, locale);
  const millions = (n: number) => t("board.millions", { value: (n / 1e6).toFixed(1) });

  // ── Grid groups ─────────────────────────────────────────────────────
  const groups: BoardGroup[] = [];
  const tileFor = (u: (typeof units)[number]) => {
    const owner = u.resident?.ownerName ?? u.reservedByLead?.name ?? "";
    return {
      id: u.id,
      unitNumber: u.unitNumber,
      status: u.status,
      sub: u.status === "AVAILABLE" ? (u.priceTHB ? t("board.millionsShort", { value: (Number(u.priceTHB) / 1e6).toFixed(1) }) : "") : tileName(owner),
      flag: u.status === "RESERVED" && reservationExpiringSoon(u.reservationExpiresAt),
      dim: filter !== null && filter !== u.status,
      href: href({ unit: u.id }),
      title: `${u.unitNumber} · ${t(`status.${u.status}`)}`,
    };
  };
  for (const type of types) {
    const tiles = units.filter((u) => u.unitTypeId === type.id).map(tileFor);
    if (!tiles.length) continue;
    const meta = [
      type.livingAreaSqm ? t("unit.sqm", { value: formatNumber(locale, Number(type.livingAreaSqm)) }) : null,
      type.bedrooms ? t("unit.bedrooms", { count: type.bedrooms }) : null,
      type.priceFromTHB ? t("board.from", { price: millions(Number(type.priceFromTHB)) }) : null,
    ].filter(Boolean);
    groups.push({ key: type.id, label: type.name, meta: meta.length ? meta.join(" · ") : null, tiles });
  }
  const untyped = units.filter((u) => !u.unitTypeId || !types.some((ty) => ty.id === u.unitTypeId)).map(tileFor);
  if (untyped.length) groups.push({ key: "other", label: t("board.otherUnits"), meta: null, tiles: untyped });

  // ── Residents table ─────────────────────────────────────────────────
  let rows: ResidentRow[] = [];
  if (view === "list") {
    const typeName = new Map(types.map((ty) => [ty.id, ty.name]));
    rows = transferred.map((u) => {
      const r = u.resident!;
      const card = r.cards[0] ?? null;
      return {
        unitId: u.id,
        residentId: r.id,
        unitNumber: u.unitNumber,
        typeName: (u.unitTypeId && typeName.get(u.unitTypeId)) || "",
        ownerName: r.ownerName,
        nationality: r.nationality,
        maskedPhone: maskPhone(r.phone),
        hasEmail: Boolean(r.email),
        purpose: r.purpose,
        transferDate: r.transferDate,
        houseCode: r.houseCode,
        cardStatus: card?.status ?? null,
        handedAt: card?.handedAt ?? null,
        members: r._count.members,
        lastLoginDays: r.lastLoginAt ? daysSince(r.lastLoginAt) : null,
        href: href({ unit: u.id }),
      };
    });
  }

  // ── House-code lookup ───────────────────────────────────────────────
  const codeQuery = (sp.code ?? "").trim();
  const codeHit = codeQuery ? await findByHouseCode(codeQuery) : null;

  // ── Drawer ──────────────────────────────────────────────────────────
  const unit = sp.unit ? await unitDetail(sp.unit) : null;
  const drawerUnit = unit && unit.project.cardCode ? unit : null;

  return (
    <div>
      <AdminPageHeader
        eyebrow={eyebrow}
        title={t("title")}
        description={t("subtitle")}
        actions={
          isAdmin && residentsWithCard > 0 ? (
            <DownloadLink href={`/api/admin/club/qr-zip/${project.id}`} className="admin-btn-ghost" title={t("zipHint")}>
              <Download size={15} aria-hidden />
              {t("zip", { count: residentsWithCard })}
            </DownloadLink>
          ) : undefined
        }
      />

      <AdminTabs
        label={t("projectTabs")}
        tabs={projects.map((p) => ({
          key: p.id,
          href: `${base}?project=${p.id}${view === "list" ? "&view=list" : ""}`,
          label: projectName(p, locale),
          active: p.id === project.id,
          count: p._count.units,
        }))}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label={t("views.label")}
          active={view}
          items={[
            { key: "map", label: t("views.map"), icon: <Grid3x3 size={13} aria-hidden />, href: href({ view: null, unit: null }) },
            { key: "list", label: t("views.list"), icon: <Users size={13} aria-hidden />, count: counts.TRANSFERRED, href: href({ view: "list", unit: null }) },
          ]}
        />
        {view === "map" && (
          <div className="flex flex-wrap gap-1.5 sm:ml-2" role="group" aria-label={t("filterLabel")}>
            {([null, ...UNIT_STATUSES] as (UnitStatus | null)[]).map((status) => {
              const active = filter === status;
              return (
                <Link
                  key={status ?? "all"}
                  href={href({ status, unit: null })}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2.5 text-[12.5px] transition-colors ${
                    active ? "border-adm-fill/50 bg-adm-fill/14 text-adm-text" : "border-adm-line text-adm-muted hover:text-adm-text"
                  }`}
                >
                  {status && <i aria-hidden className={`h-2 w-2 rounded-[3px] ${STATUS_DOT[status]}`} />}
                  {status ? t(`statusShort.${status}`) : t("statusShort.all")}
                  <b className="tabular-nums font-semibold">{status ? counts[status] : units.length}</b>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {view === "map" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <UnitBoard
            groups={groups}
            legend={UNIT_STATUSES.map((status) => ({ status, label: t(`status.${status}`) }))}
            expiringLabel={t("board.expiring")}
            emptyLabel={t("board.empty")}
          />
          <div className="grid gap-4">
            <section className="admin-card">
              <h2 className="mb-3 text-sm font-semibold text-adm-text">{pName}</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-adm-muted">{t("summary.units")}</dt>
                <dd className="text-right tabular-nums text-adm-text">{units.length}</dd>
                <dt className="text-adm-muted">{t("summary.sold")}</dt>
                <dd className="text-right tabular-nums text-adm-text">
                  {soldCount} ({units.length ? Math.round((soldCount / units.length) * 100) : 0}%)
                </dd>
                <dt className="text-adm-muted">{t("summary.value")}</dt>
                <dd className="text-right tabular-nums text-adm-text">{millions(value)}</dd>
                <dt className="text-adm-muted">{t("summary.portal")}</dt>
                <dd className="text-right tabular-nums text-adm-text">{t("summary.homes", { x: portalUsers, y: counts.TRANSFERRED })}</dd>
                <dt className="text-adm-muted">{t("summary.cards")}</dt>
                <dd className="text-right tabular-nums text-adm-text">
                  {t("summary.homes", { x: handed, y: counts.TRANSFERRED })}
                  {waiting > 0 && <span className="block text-[11.5px] text-adm-muted">{t("summary.waiting", { count: waiting })}</span>}
                </dd>
              </dl>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-adm-text/6" aria-hidden>
                {(["TRANSFERRED", "SOLD", "RESERVED"] as UnitStatus[]).map((status) => (
                  <i
                    key={status}
                    className={`block h-full ${STATUS_DOT[status]}`}
                    style={{ width: `${units.length ? (counts[status] / units.length) * 100 : 0}%` }}
                  />
                ))}
              </div>
            </section>

            <section className="admin-card">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-adm-text">
                <KeyRound size={15} className="text-adm-accent-ink" aria-hidden />
                {t("search.title")}
              </h2>
              <form method="get" action={base} className="flex gap-2">
                <input type="hidden" name="project" value={project.id} />
                <input
                  name="code"
                  defaultValue={codeQuery}
                  placeholder={t("search.placeholder")}
                  autoComplete="off"
                  className="admin-input admin-mono uppercase"
                />
                <button type="submit" className="admin-btn-ghost admin-btn-sm self-center" aria-label={t("search.submit")}>
                  <Search size={14} aria-hidden />
                </button>
              </form>
              <p className="mt-2 text-xs text-adm-muted">
                {!codeQuery ? (
                  t("search.hint")
                ) : codeHit ? (
                  <Link
                    href={`${base}?project=${codeHit.unit.projectId}&code=${encodeURIComponent(codeQuery)}&unit=${codeHit.unit.id}`}
                    scroll={false}
                    className="font-medium text-adm-info hover:underline"
                  >
                    {t("search.found", { unit: codeHit.unit.unitNumber, owner: codeHit.ownerName })}
                  </Link>
                ) : (
                  <span className="text-adm-warning">{t("search.notFound")}</span>
                )}
              </p>
            </section>
          </div>
        </div>
      ) : (
        <ResidentsTable locale={locale} rows={rows} showCodes={showCodes} toggleCodesHref={href({ codes: showCodes ? null : "1", unit: null })} />
      )}

      {drawerUnit && (
        <AdminDrawer
          title={`${projectName(drawerUnit.project, locale)} · ${drawerUnit.unitNumber}`}
          icon={<span className="admin-mono text-xs font-semibold">{drawerUnit.unitNumber}</span>}
          closeHref={href({ unit: null })}
          closeLabel={t("common.close")}
          width={600}
        >
          <UnitDrawerBody
            locale={locale}
            unit={drawerUnit}
            role={session.role}
            userName={session.name}
            isAdmin={isAdmin}
            panel={sp.panel ?? null}
            selfHref={href({ project: drawerUnit.projectId, unit: drawerUnit.id })}
          />
        </AdminDrawer>
      )}
    </div>
  );
}
