/**
 * app/[locale]/admin/projects/[id]/unit-types/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Unit Types: add at the top, every existing type editable in place
 * (specs + its own floor-plan photos) — same arrangement as
 * ../facilities/page.tsx, just one field deeper (each type carries its
 * own nested FloorPlansEditor rather than a single image field).
 */

import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus } from "lucide-react";
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
  setUnitType3dEnabled,
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
import { liftLabelFor } from "@/lib/lift-label";
import { checkModel3dRooms } from "@/lib/unit-types-3d-check";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import { collectionHref } from "@/components/admin/ui/CollectionGrid";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string; add?: string }>;
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
      _count: { select: { units: true } },
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
  const uw = await getTranslations({ locale, namespace: "admin.unitTypes.workspace" });

  /* Each type's 3D model, when it has one: how many of its rooms find their
     room here, by the same match the project page uses. */
  const model3dChecks = new Map(
    await Promise.all(
      unitTypes.map(async (type: any) => [
        type.id,
        await checkModel3dRooms(
          project.slug,
          // code ?? name, as the project page does: production's types
          // carry only a name ("Type A").
          type.code ?? type.name,
          type.floorPlans.map((plan: any) => ({
            shortLabel: liftLabelFor(plan.shortLabel, plan.floorName),
            rooms: plan.rooms.map((room: any) => ({
              matchName: room.translations.find((row: any) => row.locale === "en")?.name ?? "",
            })),
          })),
        ),
      ] as const),
    ),
  );

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
    model3d: (() => {
      const check = model3dChecks.get(type.id);
      if (!check) return null;
      return {
        enabled: type.model3dEnabled ?? true,
        matchedLabel: uw("model3dMatched", { matched: check.matched, total: check.total }),
        complete: check.matched === check.total,
      };
    })(),
    // Plots actually placed on the plan, falling back to the declared total.
    unitCount: type._count.units || type.totalUnits,
    /* What the old "at a glance" cards called out, now on the type switcher:
       no price shows "price on request" publicly whether or not that was
       meant; no Thai description shows the English one to Thai readers. */
    warnings: [
      type.priceFromTHB === null ? t("unitTypes.card.noPrice") : null,
      (type.translations.find((row: any) => row.locale === "th")?.description?.trim() || type.descriptionTh?.trim())
        ? null
        : t("unitTypes.card.noThai"),
    ].filter((warning): warning is string => Boolean(warning)),
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
        /*
          Prefilled with the fallback the public page already shows
          (lib/lift-label.ts). Plans from before the column existed have no
          label, and the save requires one — so on the deployed site every
          save of a type with such a floor failed, whatever was changed,
          while the site and the preview both displayed a label that looked
          set. Prefilled, the admin sees what the site shows and the first
          save stores it.
        */
        shortLabel: liftLabelFor(plan.shortLabel, plan.floorName),
        areaSqm: plan.areaSqm === null ? "" : String(plan.areaSqm),
        imageUrl: plan.imageUrl,
        blueprintImageUrl: plan.blueprintImageUrl ?? null,
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-adm-text">{type.name}</h2>
              <TranslationStatusBadges completeness={completeness} />
            </span>
            {/* The description is the only translated field; the language
                switch lives with it rather than at the top of the page,
                where it read as if it switched the room names too. */}
            <LanguageTabs
              active={lang}
              completeness={completeness}
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
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
    model3dShow: uw("model3dShow"),
    model3dFailed: t("common.error"),
    floorsShort: uw("floorsShort"),
    unitsShort: uw("unitsShort"),
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
    deleteRoom: uw("deleteRoom"),
    untranslated: uw("untranslated"),
    roomTotal: uw("roomTotal"),
    areaMatches: uw("areaMatches"),
    areaDiffers: uw("areaDiffers"),
    noRooms: uw("noRooms"),
    allRooms: uw("allRooms"),
    prevRoom: uw("prevRoom"),
    nextRoom: uw("nextRoom"),
    floorSettings: uw("floorSettings"),
    floorSettingsHint: uw("floorSettingsHint"),
    roomPickHint: uw("roomPickHint"),
    pinLabels: uw("pinLabels"),
    unsaved: uw("unsaved"),
    discard: uw("discard"),
    save: t("common.save"),
    saving: t("common.saving"),
    saved: t("common.saved"),
    saveFailed: t("common.error"),
    complete: uw("complete"),
    noFloorsBadge: uw("noFloorsBadge"),
    noFloors: uw("noFloors"),
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
      showHomePhoto: up("showHomePhoto"),
      previousRoom: up("previousRoom"),
      nextRoom: up("nextRoom"),
      close: up("close"),
      floorSelector: up("floorSelector"),
      viewMode: up("viewMode"),
      viewPlan: up("viewPlan"),
      view3d: up("view3d"),
      room: up("room"),
      tapRoom3d: up("tapRoom3d"),
      ofFloor: up("ofFloor"),
      model3d: {
        top: up("model3d.top"),
        overview: up("model3d.overview"),
        street: up("model3d.street"),
        walls: up("model3d.walls"),
        wallModes: [up("model3d.wallFull"), up("model3d.wallCut"), up("model3d.wallOff")] as [string, string, string],
        hint: up("model3d.hint"),
        loading: up("model3d.loading"),
      },
    },
    translationComplete: t("common.translationComplete"),
    translationMissing: t("common.translationMissing"),
  };

  const base = `/${locale}/admin/projects/${project.id}/unit-types`;
  const addHref = (open: boolean) => collectionHref(base, searchParams.lang, null) + (open ? `${searchParams.lang ? "&" : "?"}add=1` : "");

  return (
    <div className="space-y-6">
      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="unitTypes"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-adm-muted">{t("unitTypes.subtitle")}</p>
        {canWrite && (
          <Link href={addHref(true)} scroll={false} className="admin-btn">
            <Plus size={15} aria-hidden />
            {t("unitTypes.newTitle")}
          </Link>
        )}
      </div>

      {/* ── Floors, plans and room pins ──────────────────────────────
          The workspace holds one unsaved draft for the whole type — see
          its own header. The per-type spec forms below are unchanged and
          still save through their own action. */}
      {draftTypes.length === 0 && (
        <div className="admin-card text-center text-sm text-adm-muted">{t("unitTypes.empty")}</div>
      )}

      {draftTypes.length > 0 && (
        <UnitTypesWorkspace
          locale={locale}
          projectName={projectName}
          projectSlug={project.slug}
          types={draftTypes}
          initialFloorsByType={floorsByType}
          detailForms={detailForms}
          onReorder={reorderUnitTypes.bind(null, locale, project.id, project.slug)}
          onToggle3d={setUnitType3dEnabled.bind(null, locale, project.id, project.slug)}
          locales={locales}
          adminLocales={adminLocales}
          canWrite={canWrite}
          onSave={saveUnitTypeFloors.bind(null, locale, project.id, project.slug)}
          labels={workspaceLabels}
        />
      )}

      {/* ── Add — in a drawer, opened from the button above ─────────
          This form used to sit open at the bottom of the page, a second
          full set of type fields under the one being edited. */}
      {canWrite && searchParams.add === "1" && (
        <AdminDrawer
          title={t("unitTypes.newTitle")}
          icon={<Plus size={18} aria-hidden />}
          closeHref={addHref(false)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={{ en: true, th: true, zh: true, ru: true }}
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <UnitTypeForm
              key={lang}
              lang={lang}
              projectSlug={project.slug}
              action={saveUnitType.bind(null, locale, project.id, project.slug, null)}
              manageFloorPlans={false}
              submitLabel={t("common.create")}
            />
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}

