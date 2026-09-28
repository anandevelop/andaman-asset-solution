/**
 * app/[locale]/admin/projects/[id]/unit-types/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Unit Types: add at the top, every existing type editable in place
 * (specs + its own floor-plan photos) — same arrangement as
 * ../facilities/page.tsx, just one field deeper (each type carries its
 * own nested FloorPlansEditor rather than a single image field).
 */

import Link from "next/link";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import ProjectUnitsSubnav from "@/components/admin/ProjectUnitsSubnav";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import {
  saveUnitType,
  deleteUnitType,
  saveUnitTypeFloors,
  reorderUnitTypes,
} from "./actions";
import UnitTypesWorkspace, {
  type DraftFloor,
  type DraftType,
} from "@/components/admin/unit-types/UnitTypesWorkspace";
import { locales, adminLocales, type Locale } from "@/i18n";
import { DEFAULT_PLAN_ASPECT } from "@/lib/projects";
import UnitTypeForm from "@/components/admin/UnitTypeForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/** null / Decimal / number → the string an <input> expects — same helper
 *  as ../edit/page.tsx's own `str()`. */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default async function AdminProjectUnitTypesPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id: projectId } = params;
  /* VIEWER may open this to see a project's unit types; only EDITOR
     and above may submit either form below. */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });
  if (!project) notFound();

  const unitTypes = await db.projectUnitType.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      floorPlans: {
        orderBy: { sortOrder: "asc" },
        include: {
          rooms: { orderBy: { sortOrder: "asc" }, include: { translations: true } },
        },
      },
      translations: true,
    },
  });

  const projectName = locale === "th" ? project.nameTh : project.nameEn;

  /*
    The workspace's starting draft.

    Areas arrive as the strings their inputs hold rather than numbers: an
    admin halfway through typing "19." has a value that is not a number yet,
    and storing it as one would either reject the keystroke or silently
    round it. They are parsed once, on save.
  */
  const draftTypes: DraftType[] = unitTypes.map((type: any) => ({
    id: type.id,
    name: type.name,
    code: type.code,
    bedrooms: type.bedrooms,
    bathrooms: type.bathrooms,
    livingAreaSqm: type.livingAreaSqm === null ? null : Number(type.livingAreaSqm),
    totalUnits: type.totalUnits,
    hasPrivateLift: type.hasPrivateLift,
    floors: [],
  }));

  const floorsByType: Record<string, DraftFloor[]> = Object.fromEntries(
    unitTypes.map((type: any) => [
      type.id,
      type.floorPlans.map((plan: any) => ({
        // The database id doubles as the draft key for a saved row; only
        // rows the admin adds need a temporary one.
        key: plan.id,
        id: plan.id,
        floorName: plan.floorName,
        shortLabel: plan.shortLabel ?? "",
        areaSqm: plan.areaSqm === null ? "" : String(plan.areaSqm),
        imageUrl: plan.imageUrl,
        furnishedImageUrl: plan.furnishedImageUrl,
        aspect:
          plan.imageWidth && plan.imageHeight
            ? plan.imageWidth / plan.imageHeight
            : DEFAULT_PLAN_ASPECT,
        portraitRotation: plan.portraitRotation,
        rooms: plan.rooms.map((room: any) => ({
          key: room.id,
          id: room.id,
          names: Object.fromEntries(
            room.translations.map((row: any) => [row.locale, row.name]),
          ) as Partial<Record<Locale, string>>,
          areaSqm: room.areaSqm === null ? "" : String(room.areaSqm),
          xPercent: room.xPercent,
          yPercent: room.yPercent,
          photoUrl: room.photoUrl,
        })),
      })),
    ]),
  );

  const uw = await getTranslations({ locale, namespace: "admin.unitTypes.workspace" });
  const up = await getTranslations({ locale, namespace: "projects.unitTypesSection" });

  /*
    One spec form per type, rendered here and shown inside the workspace's
    "type details" tab.

    They used to be a list of cards below the workspace, which meant two
    editors for the same type on one screen and a reader with no way to tell
    which one owned what. Built on the server because UnitTypeForm binds a
    server action per type.
  */
  const detailForms = Object.fromEntries(
    unitTypes.map((type: any) => {
      const editing = pickEditingTranslation<any>(type.translations, lang);
      const completeness = translationCompleteness<any>(type.translations, "description");

      return [
        type.id,
        <section key={type.id} className="admin-card">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-primary">{type.name}</h2>
            <TranslationStatusBadges completeness={completeness} />
          </div>

          <fieldset disabled={!canWrite} className="contents">
            <UnitTypeForm
              lang={lang}
              projectSlug={project.slug}
              action={saveUnitType.bind(null, locale, project.id, project.slug, type.id)}
              onDelete={deleteUnitType.bind(null, locale, project.id, project.slug, type.id)}
              values={{
                name: type.name,
                description: editing?.description ?? "",
                livingAreaSqm: str(type.livingAreaSqm),
                bedrooms: str(type.bedrooms),
                bathrooms: str(type.bathrooms),
                totalUnits: str(type.totalUnits),
                sortOrder: String(type.sortOrder),
                floorPlans: [],
              }}
              manageFloorPlans={false}
              submitLabel={t("common.save")}
            />
          </fieldset>
        </section>,
      ];
    }),
  );

  const workspaceLabels = {
    tabs: { details: uw("tabDetails"), floors: uw("tabFloors"), preview: uw("tabPreview") },
    typeList: uw("typeList"),
    addFloor: uw("addFloor"),
    copyFloor: uw("copyFloor"),
    floorName: uw("floorName"),
    liftLabel: uw("liftLabel"),
    floorArea: uw("floorArea"),
    rotation: uw("rotation"),
    rotationCw: uw("rotationCw"),
    rotationCcw: uw("rotationCcw"),
    rotationHint: uw("rotationHint"),
    moveUp: uw("moveUp"),
    moveDown: uw("moveDown"),
    deleteFloor: uw("deleteFloor"),
    lastFloor: uw("lastFloor"),
    lineUpload: uw("lineUpload"),
    lineUploadHint: uw("lineUploadHint"),
    furnishedUpload: uw("furnishedUpload"),
    furnishedUploadHint: uw("furnishedUploadHint"),
    roomsHeading: uw("roomsHeading"),
    roomName: uw("roomName"),
    roomArea: uw("roomArea"),
    roomPhoto: uw("roomPhoto"),
    pickPhoto: uw("pickPhoto"),
    clearPhoto: uw("clearPhoto"),
    deleteRoom: uw("deleteRoom"),
    untranslated: uw("untranslated"),
    roomTotal: uw("roomTotal"),
    areaMatches: uw("areaMatches"),
    areaDiffers: uw("areaDiffers"),
    noRooms: uw("noRooms"),
    unsaved: uw("unsaved"),
    discard: uw("discard"),
    save: t("common.save"),
    saving: t("common.saving"),
    saved: t("common.saved"),
    saveFailed: t("common.error"),
    complete: uw("complete"),
    issues: uw("issues"),
    desktop: uw("desktop"),
    mobile: uw("mobile"),
    previewHint: uw("previewHint"),
    sqm: uw("sqm"),
    issueLabels: {
      noPlan: uw("issue.noPlan"),
      noRooms: uw("issue.noRooms"),
      roomsWithoutPhoto: uw("issue.roomsWithoutPhoto"),
      roomsUntranslated: uw("issue.roomsUntranslated"),
      furnishedAspect: uw("issue.furnishedAspect"),
      areaMismatch: uw("issue.areaMismatch"),
    },
    pinner: {
      lineView: uw("lineView"),
      furnishedView: uw("furnishedView"),
      placePin: uw("placePin"),
      stopPlacing: uw("stopPlacing"),
      placeHint: uw("placeHint"),
      dragHint: uw("dragHint"),
      noPlan: uw("issue.noPlan"),
      noPlanHint: uw("noPlanHint"),
      deleteSelected: uw("deleteSelected"),
    },
    elevator: {
      eyebrow: t("unitTypes.title"),
      project: up("project"),
      type: up("type"),
      bed: up("bed"),
      bath: up("bath"),
      floor: up("floor"),
      areaThisFloor: up("areaThisFloor"),
      areaByFloor: up("areaByFloor"),
      total: up("total"),
      roomSchedule: up("roomSchedule"),
      sqm: up("sqm"),
      notToScale: up("notToScale"),
      showHomePhoto: up("showHomePhoto"),
      previousRoom: up("previousRoom"),
      nextRoom: up("nextRoom"),
      close: up("close"),
      floorSelector: up("floorSelector"),
    },
    translationComplete: t("common.translationComplete"),
    translationMissing: t("common.translationMissing"),
  };

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects/${project.id}/edit`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {projectName}
        </Link>

        <p className="admin-section-title mt-4">{t("unitTypes.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("unitTypes.subtitle")}</p>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="units"
      />

      <ProjectUnitsSubnav locale={locale} projectId={project.id} active="unitTypes" />

      {/* One language selection drives every unit type's description field
          on this page — see the file comment on LanguageTabs. Hardcoded
          "all complete" here for the same reason facilities/page.tsx's
          does: this tab row switches the whole page's language, not one
          record's, so per-record completeness is shown separately via
          TranslationStatusBadges next to each type's own heading below. */}
      <LanguageTabs
        active={lang}
        completeness={{ en: true, th: true, zh: true, ru: true }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      {/* ── Floors, plans and room pins ──────────────────────────────
          The workspace holds one unsaved draft for the whole type — see
          its own header. The per-type spec forms below are unchanged and
          still save through their own action. */}
      {draftTypes.length > 0 && (
        <UnitTypesWorkspace
          locale={locale}
          projectName={projectName}
          projectSlug={project.slug}
          types={draftTypes}
          initialFloorsByType={floorsByType}
          detailForms={detailForms}
          onReorder={reorderUnitTypes.bind(null, locale, project.id, project.slug)}
          locales={locales}
          adminLocales={adminLocales}
          canWrite={canWrite}
          onSave={saveUnitTypeFloors.bind(null, locale, project.id, project.slug)}
          labels={workspaceLabels}
        />
      )}

      {/* ── Add ─────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("unitTypes.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <UnitTypeForm
            key={lang}
            lang={lang}
            projectSlug={project.slug}
            action={saveUnitType.bind(null, locale, project.id, project.slug, null)}
            manageFloorPlans={false}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

    </div>
  );
}
