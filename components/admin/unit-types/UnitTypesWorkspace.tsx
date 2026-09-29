"use client";

/**
 * components/admin/unit-types/UnitTypesWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Editing one unit type's floors, plans and room pins.
 *
 * ONE DRAFT, ONE SAVE
 *
 * Everything on this screen — the floor list, each plan, every pin, every
 * room name in four languages — is held as a single draft and submitted by
 * one action. The alternative, a server action per field, would mean a
 * round trip for every character of a room name and a half-saved floor
 * whenever one of them failed. It also makes the live preview honest: it
 * renders the draft, so it shows what is about to be saved rather than what
 * was saved last.
 *
 * The cost is that leaving with unsaved work loses it, which is why there
 * is a dirty flag, a sticky bar and a beforeunload guard.
 *
 * WHY THE PREVIEW IS THE REAL COMPONENT
 *
 * The preview tab mounts UnitTypesElevator itself, with the draft mapped
 * into its props. A second "preview" implementation would drift from the
 * real one the first time either changed, and the drift would show up as
 * "it looked right in the admin" — which is the failure this screen exists
 * to prevent.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n";
import ImageUploader from "@/components/admin/ImageUploader";
import MediaLibraryPicker from "@/components/admin/MediaLibraryPicker";
import SaveToast from "@/components/admin/SaveToast";
import UnitTypesElevator from "@/components/unit-types/UnitTypesElevator";
import type { ElevatorLabels, ElevatorType } from "@/components/unit-types/types";
import { unitTypeHealth, type FloorIssue } from "@/lib/admin/unit-type-health";
import { formatNumber } from "@/lib/format";
import { liftLabelFor } from "@/lib/lift-label";
import type { UnitTypeFloorsInput } from "@/lib/validations";
import FloorPlanPinner, { type PinnerRoom } from "./FloorPlanPinner";
import { useDraftBlueprints } from "./useDraftBlueprints";

// ── The draft ───────────────────────────────────────────────────────────

export type DraftRoom = {
  /** Stable within the draft. A database id for a saved room, or "new:n". */
  key: string;
  id: string | null;
  names: Partial<Record<Locale, string>>;
  areaSqm: string;
  xPercent: number;
  yPercent: number;
  photoUrl: string | null;
};

export type DraftFloor = {
  key: string;
  id: string | null;
  floorName: string;
  shortLabel: string;
  areaSqm: string;
  imageUrl: string;
  /** The saved dark-frame variant of imageUrl. Null until a save derives
   *  one — the preview draws its own meanwhile (useDraftBlueprints). */
  blueprintImageUrl: string | null;
  furnishedImageUrl: string | null;
  aspect: number;
  portraitRotation: "CW" | "CCW";
  rooms: DraftRoom[];
};

export type DraftType = {
  id: string;
  name: string;
  code: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  livingAreaSqm: number | null;
  totalUnits: number | null;
  hasPrivateLift: boolean;
  floors: DraftFloor[];
};

export type WorkspaceLabels = {
  tabs: { details: string; floors: string; preview: string };
  typeList: string;
  addFloor: string;
  copyFloor: string;
  floorName: string;
  liftLabel: string;
  floorArea: string;
  rotation: string;
  rotationCw: string;
  rotationCcw: string;
  rotationHint: string;
  moveUp: string;
  moveDown: string;
  deleteFloor: string;
  lastFloor: string;
  lineUpload: string;
  lineUploadHint: string;
  furnishedUpload: string;
  furnishedUploadHint: string;
  roomsHeading: string;
  roomName: string;
  roomArea: string;
  roomPhoto: string;
  pickPhoto: string;
  clearPhoto: string;
  deleteRoom: string;
  untranslated: string;
  roomTotal: string;
  areaMatches: string;
  areaDiffers: string;
  noRooms: string;
  unsaved: string;
  discard: string;
  save: string;
  saving: string;
  saved: string;
  saveFailed: string;
  complete: string;
  noFloorsBadge: string;
  noFloors: string;
  issues: string;
  desktop: string;
  mobile: string;
  previewHint: string;
  sqm: string;
  issueLabels: Record<FloorIssue["kind"], string>;
  pinner: React.ComponentProps<typeof FloorPlanPinner>["labels"];
  elevator: ElevatorLabels;
  translationComplete: string;
  translationMissing: string;
};

type Props = {
  locale: string;
  projectName: string;
  projectSlug: string;
  types: DraftType[];
  initialFloorsByType: Record<string, DraftFloor[]>;
  locales: readonly Locale[];
  adminLocales: readonly Locale[];
  canWrite: boolean;
  /**
   * The existing spec form for each type, rendered on the server and keyed
   * by type id.
   *
   * Passed as nodes rather than rebuilt here: UnitTypeForm already owns the
   * spec fields, their validation and their own save, and a second copy
   * inside this component would be two forms writing the same columns. They
   * are all rendered and the inactive ones hidden, because the type is
   * switched on the client and re-fetching a form per click would mean a
   * round trip to show fields that are already on the page.
   */
  detailForms?: Record<string, React.ReactNode>;
  /** Bound server action — persists the order the list was dragged into. */
  onReorder?: (orderedIds: string[]) => Promise<{ ok: boolean; message?: string }>;
  labels: WorkspaceLabels;
  /**
   * Bound server action. A function prop is fine here and only here: this
   * is a Client Component receiving a *server action*, which React
   * serialises by reference — unlike an ordinary function, which is the
   * render error this codebase has hit three times.
   */
  onSave: (
    unitTypeId: string,
    payload: UnitTypeFloorsInput,
  ) => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>;
};

/**
 * True when every field in the patch already holds that value.
 *
 * ImageUploader re-fires onChange on every render of its parent, not only
 * when the file changes — its own comment warns that this is fine "if
 * onChange is idempotent", and marking the draft dirty is not. Without this
 * guard the unsaved bar appeared on load, before anybody had touched
 * anything, which makes it mean nothing.
 */
function isNoop<T>(row: T, patch: Partial<T>): boolean {
  return Object.entries(patch).every(([field, value]) => row[field as keyof T] === value);
}

/** A new, empty floor at the end of the draft. */
function blankFloor(): DraftFloor {
  return {
    key: nextKey("floor"),
    id: null,
    floorName: "",
    shortLabel: "",
    areaSqm: "",
    imageUrl: "",
    blueprintImageUrl: null,
    furnishedImageUrl: null,
    aspect: 2.8,
    portraitRotation: "CW",
    rooms: [],
  };
}

/**
 * A floor ready to be attached to a different unit type.
 *
 * Every database id is dropped and every draft key regenerated, so the save
 * creates new rows instead of updating — and moving a pin on the copy
 * cannot move it on the original, which is what sharing ids would mean.
 */
function detachFloor(floor: DraftFloor): DraftFloor {
  return {
    ...floor,
    key: nextKey("floor"),
    id: null,
    rooms: floor.rooms.map((room) => ({ ...room, key: nextKey("room"), id: null })),
  };
}

let temporaryKey = 0;
const nextKey = (prefix: string) => `${prefix}:${(temporaryKey += 1)}`;

const toNumberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function UnitTypesWorkspace({
  locale,
  projectName,
  projectSlug,
  types,
  initialFloorsByType,
  locales,
  adminLocales,
  canWrite,
  detailForms,
  labels,
  onSave,
  onReorder,
}: Props) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [tab, setTab] = useState<"details" | "floors" | "preview">("floors");
  const [lang, setLang] = useState<Locale>(adminLocales[0] ?? "en");
  const [floorsByType, setFloorsByType] = useState(initialFloorsByType);
  const [floorKey, setFloorKey] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  /*
    Which types have unsaved changes, not a single boolean.

    Copying a floor writes into a *different* type's draft than the one on
    screen, so a lone flag would show the bar and then save only the type
    the admin happened to be looking at — silently dropping the copy.
  */
  const [dirtyTypes, setDirtyTypes] = useState<string[]>([]);
  const [result, setResult] = useState<{
    ok: boolean;
    message?: string;
    fields?: Record<string, string>;
  } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  /*
    The dragged order, held locally so the list reorders under the pointer
    and only then persists. Null while nothing has been dragged, so the
    server's own order stays authoritative until it has been.
  */
  const [order, setOrder] = useState<string[] | null>(null);
  const dragFrom = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();

  const saved = useRef(initialFloorsByType);

  const orderedTypes = useMemo(() => {
    if (!order) return types;

    const byId = new Map(types.map((candidate) => [candidate.id, candidate]));
    // Anything the drag order does not mention — a type added in another
    // tab since — keeps its place at the end rather than disappearing.
    const dragged = order.map((id) => byId.get(id)).filter(Boolean) as DraftType[];
    const rest = types.filter((candidate) => !order.includes(candidate.id));

    return [...dragged, ...rest];
  }, [order, types]);

  const type = types.find((candidate) => candidate.id === typeId) ?? types[0];
  const floors = useMemo(() => floorsByType[type?.id ?? ""] ?? [], [floorsByType, type]);
  const floor = floors.find((f) => f.key === floorKey) ?? floors[0];

  /*
    Switching type clears the floor, pin selection and placing mode.

    Done in the handler rather than an effect on typeId: the only thing that
    changes the type is the button below, so an effect would be React
    reacting to its own state a render later — which is exactly the
    cascading-render pattern the lint rule names. Clearing the key rather
    than looking up the new type's first floor, because the `floor` binding
    above already falls back to floors[0] when the key matches nothing.
  */
  const selectType = useCallback((nextTypeId: string) => {
    setTypeId(nextTypeId);
    setFloorKey(null);
    setSelectedRoom(null);
    setPlacing(false);
  }, []);

  /*
    The browser's own guard. It cannot be styled or worded, and it only
    fires for a real navigation — but it is the only thing that catches a
    closed tab, which is how this work actually gets lost.
  */
  useEffect(() => {
    if (dirtyTypes.length === 0) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyTypes]);

  const markDirty = useCallback(
    (id: string) => setDirtyTypes((current) => (current.includes(id) ? current : [...current, id])),
    [],
  );

  /** Edit another type's floors — what "copy this floor to…" does. */
  const mutateType = useCallback(
    (targetId: string, update: (current: DraftFloor[]) => DraftFloor[]) => {
      setFloorsByType((current) => ({
        ...current,
        [targetId]: update(current[targetId] ?? []),
      }));
      markDirty(targetId);
    },
    [markDirty],
  );

  const mutate = useCallback(
    (update: (current: DraftFloor[]) => DraftFloor[]) => {
      if (!type) return;
      const before = floorsByType[type.id] ?? [];
      const after = update(before);

      // An update that returned the same array changed nothing — see isNoop
      // for the caller that does this on every render. Compared out here
      // rather than inside the updater, which has to stay pure.
      if (after === before) return;

      setFloorsByType((current) => ({ ...current, [type.id]: after }));
      markDirty(type.id);
    },
    [type, floorsByType, markDirty],
  );

  const patchFloor = useCallback(
    (key: string, patch: Partial<DraftFloor>) =>
      mutate((current) => {
        const target = current.find((f) => f.key === key);
        if (!target || isNoop(target, patch)) return current;

        return current.map((f) => (f.key === key ? { ...f, ...patch } : f));
      }),
    [mutate],
  );

  const patchRoom = useCallback(
    (floorKeyValue: string, roomKey: string, patch: Partial<DraftRoom>) =>
      mutate((current) =>
        current.map((f) =>
          f.key === floorKeyValue
            ? { ...f, rooms: f.rooms.map((r) => (r.key === roomKey ? { ...r, ...patch } : r)) }
            : f,
        ),
      ),
    [mutate],
  );

  const health = useMemo(
    () =>
      unitTypeHealth(
        floors.map((f) => ({
          floorName: f.floorName,
          shortLabel: f.shortLabel,
          imageUrl: f.imageUrl,
          furnishedImageUrl: f.furnishedImageUrl,
          areaSqm: toNumberOrNull(f.areaSqm),
          rooms: f.rooms.map((r) => ({
            names: r.names,
            areaSqm: toNumberOrNull(r.areaSqm),
            photoUrl: r.photoUrl,
          })),
        })),
        locales,
      ),
    [floors, locales],
  );

  /** One type's floors, shaped for the action. */
  const payloadFor = (rows: DraftFloor[]) => ({
    floors: rows.map((f, index) => ({
      id: f.id,
      floorName: f.floorName,
      shortLabel: f.shortLabel,
      areaSqm: toNumberOrNull(f.areaSqm),
      imageUrl: f.imageUrl,
      furnishedImageUrl: f.furnishedImageUrl,
      portraitRotation: f.portraitRotation,
      sortOrder: index,
      rooms: f.rooms.map((r, roomIndex) => ({
        id: r.id,
        names: r.names,
        areaSqm: toNumberOrNull(r.areaSqm),
        xPercent: r.xPercent,
        yPercent: r.yPercent,
        photoUrl: r.photoUrl,
        sortOrder: roomIndex,
      })),
    })),
  });

  const save = () => {
    startTransition(async () => {
      /*
        Every changed type, not just the one on screen. Sequential rather
        than Promise.all: each call derives blueprints and opens a
        transaction, and there are at most a handful of types — running them
        together buys nothing and makes a partial failure harder to report.
      */
      const stillDirty: string[] = [];
      let failure: { ok: boolean; message?: string; fields?: Record<string, string> } | null =
        null;

      for (const id of dirtyTypes) {
        const rows = floorsByType[id] ?? [];
        const outcome = await onSave(id, payloadFor(rows));

        if (outcome.ok) {
          saved.current = { ...saved.current, [id]: rows };
        } else {
          stillDirty.push(id);
          failure = failure ?? outcome;
        }
      }

      setDirtyTypes(stillDirty);
      setResult(failure ?? { ok: true });
    });
  };

  const discard = () => {
    setFloorsByType(saved.current);
    setDirtyTypes([]);
    setResult(null);
  };

  if (!type) {
    return <p className="admin-card text-sm text-ink-muted">{labels.noRooms}</p>;
  }

  return (
    /* data-unit-types-workspace is a test hook: the page also carries the
       older per-type spec forms, whose inputs look identical to these. */
    <div data-unit-types-workspace className="space-y-5">
      {result && (
        <SaveToast tone={result.ok ? "success" : "error"} token={result}>
          {result.ok ? <Check size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
          {result.ok ? labels.saved : labels.saveFailed}
          {/* Which field, when the server said. A refused room name and a
              database failure used to read identically: "Something went
              wrong", with the reason thrown away on the way to the toast. */}
          {!result.ok && result.fields && Object.values(result.fields)[0] && (
            <span className="ml-1">({Object.values(result.fields)[0]})</span>
          )}
        </SaveToast>
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* ── Type list ───────────────────────────────────────────── */}
        <aside className="admin-card h-fit p-0!">
          <h2 className="border-b border-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            {labels.typeList}
          </h2>

          <ul className="divide-y divide-primary/5">
            {orderedTypes.map((candidate, position) => {
              const candidateFloors = floorsByType[candidate.id] ?? [];
              const issues = unitTypeHealth(
                candidateFloors.map((f) => ({
                  floorName: f.floorName,
                  shortLabel: f.shortLabel,
                  imageUrl: f.imageUrl,
                  furnishedImageUrl: f.furnishedImageUrl,
                  areaSqm: toNumberOrNull(f.areaSqm),
                  rooms: f.rooms.map((r) => ({
                    names: r.names,
                    areaSqm: toNumberOrNull(r.areaSqm),
                    photoUrl: r.photoUrl,
                  })),
                })),
                locales,
              ).issueCount;

              return (
                <li
                  key={candidate.id}
                  draggable={canWrite && Boolean(onReorder)}
                  onDragStart={() => {
                    dragFrom.current = candidate.id;
                  }}
                  // Without preventDefault the browser refuses the drop.
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (!from || from === candidate.id) return;

                    const current = orderedTypes.map((row) => row.id);
                    const next = current.filter((id) => id !== from);
                    next.splice(position, 0, from);

                    setOrder(next);
                    // Persisted immediately: the order is one column on a
                    // handful of rows, and holding it in the unsaved bar
                    // alongside the floor draft would mean one Save writing
                    // two unrelated things.
                    void onReorder?.(next);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => selectType(candidate.id)}
                    aria-pressed={candidate.id === type.id}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      candidate.id === type.id ? "bg-surface-muted" : "hover:bg-surface-muted/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-primary">{candidate.name}</span>
                      {/* No floors is not "Ready": there is nothing to check,
                          and nothing on the public page either. */}
                      <span
                        className={`rounded-xs px-1.5 py-0.5 text-[11px] font-medium ${
                          candidateFloors.length === 0
                            ? "bg-primary/5 text-ink-muted"
                            : issues === 0
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        {candidateFloors.length === 0
                          ? labels.noFloorsBadge
                          : issues === 0
                            ? labels.complete
                            : `${issues} ${labels.issues}`}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {candidateFloors.length} · {candidate.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Editor ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b border-primary/10">
            {(["details", "floors", "preview"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                  tab === key
                    ? "border-accent-700 font-medium text-primary"
                    : "border-transparent text-ink-muted hover:text-primary"
                }`}
              >
                {labels.tabs[key]}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <DetailsTab
              type={type}
              floors={floors}
              labels={labels}
              forms={detailForms}
              activeId={type.id}
            />
          )}

          {/*
            A type with no floors yet. FloorsTab is built around a selected
            floor and holds the only "Add floor" button, so it cannot render
            here — and with nothing in its place, a new type (all of The
            Victory's, on the deployed site) showed an empty tab with no way
            to add its first floor.
          */}
          {tab === "floors" && !floor && (
            <div className="admin-card space-y-3 text-sm">
              <p className="text-ink-muted">{labels.noFloors}</p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    const first = blankFloor();
                    mutate((current) => [...current, first]);
                    setFloorKey(first.key);
                  }}
                  className="admin-btn-ghost"
                >
                  <Plus size={14} aria-hidden />
                  {labels.addFloor}
                </button>
              )}
            </div>
          )}

          {tab === "floors" && floor && (
            <FloorsTab
              locale={locale}
              projectSlug={projectSlug}
              floors={floors}
              floor={floor}
              health={health}
              lang={lang}
              adminLocales={adminLocales}
              canWrite={canWrite}
              labels={labels}
              otherTypes={types.filter((candidate) => candidate.id !== type.id)}
              onCopyFloor={(targetTypeId, source) =>
                mutateType(targetTypeId, (current) => [...current, source])
              }
              placing={placing}
              selectedRoom={selectedRoom}
              onSelectFloor={setFloorKey}
              onSelectLang={setLang}
              onSelectRoom={setSelectedRoom}
              onTogglePlacing={() => setPlacing((value) => !value)}
              onPatchFloor={patchFloor}
              onPatchRoom={patchRoom}
              onMutate={mutate}
            />
          )}

          {tab === "preview" && (
            <PreviewTab
              locale={locale}
              type={type}
              floors={floors}
              projectName={projectName}
              width={previewWidth}
              labels={labels}
              onWidth={setPreviewWidth}
            />
          )}
        </div>
      </div>

      {/* ── Save bar ────────────────────────────────────────────── */}
      {canWrite && dirtyTypes.length > 0 && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 bg-surface-raised/95 px-4 py-3 shadow-[0_-4px_16px_-8px_rgba(8,53,81,.25)] backdrop-blur">
          <p className="flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle size={15} aria-hidden />
            {labels.unsaved}
          </p>

          <span className="flex gap-2">
            <button type="button" onClick={discard} className="admin-btn-ghost" disabled={pending}>
              {labels.discard}
            </button>
            <button type="button" onClick={save} className="admin-btn" disabled={pending}>
              {pending ? labels.saving : labels.save}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────

function DetailsTab({
  floors,
  labels,
  forms,
  activeId,
}: {
  type: DraftType;
  floors: DraftFloor[];
  labels: WorkspaceLabels;
  forms?: Record<string, React.ReactNode>;
  activeId: string;
}) {
  const total = floors.reduce((sum, f) => sum + (toNumberOrNull(f.areaSqm) ?? 0), 0);

  return (
    <section className="space-y-4">
      {/*
        The sum of the floors, next to the living area the spec form asks
        for. They are separate figures in the Sale Kits and do not always
        agree, so this is shown rather than enforced — but an editor typing
        a living area has no other way to see what the floors add up to.
      */}
      <p className="admin-card text-sm">
        <span className="text-ink-muted">{labels.roomTotal}: </span>
        <span className="font-medium text-primary">
          {total.toFixed(2)} {labels.sqm}
        </span>
        <span className="admin-hint mt-1 block">{labels.previewHint}</span>
      </p>

      {/*
        Every type's form is on the page; only the selected one is shown.
        Hidden with `hidden` rather than unmounted so a half-typed
        description survives flicking to another type and back — the same
        reason the floors themselves are held as one draft.
      */}
      {forms &&
        Object.entries(forms).map(([id, form]) => (
          <div key={id} hidden={id !== activeId}>
            {form}
          </div>
        ))}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4 border-b border-primary/5 pb-2">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-primary">{value}</span>
    </p>
  );
}

function PreviewTab({
  locale,
  type,
  floors,
  projectName,
  width,
  labels,
  onWidth,
}: {
  locale: string;
  type: DraftType;
  floors: DraftFloor[];
  projectName: string;
  width: "desktop" | "mobile";
  labels: WorkspaceLabels;
  onWidth: (value: "desktop" | "mobile") => void;
}) {
  const largest = Math.max(...floors.map((f) => toNumberOrNull(f.areaSqm) ?? 0), 0);
  // The shaft is navy: a white-paper line drawing there is a solid white
  // box. Draw what the public page draws — the blueprint.
  const planFor = useDraftBlueprints(floors);
  // The heading, chip and area strings, built exactly as the public page
  // builds them (app/[locale]/(site)/projects/[slug]/page.tsx) but from the
  // draft. The preview used to print the bare type name as the heading, an
  // empty subtitle and "228.00" where the site says "228" — the first thing
  // anyone comparing it with the mockup noticed.
  const ut = useTranslations("projects.unitTypesSection");
  const area = (value: number | null) => (value === null ? null : formatNumber(locale, value));
  const areaOf = (raw: string) => area(toNumberOrNull(raw));

  const elevatorType: ElevatorType = {
    id: type.id,
    name: type.name,
    code: type.code ?? type.name,
    bedrooms: type.bedrooms === null ? "—" : String(type.bedrooms),
    bathrooms: type.bathrooms === null ? "—" : String(type.bathrooms),
    totalAreaLabel: area(type.livingAreaSqm),
    chipMeta: [
      type.livingAreaSqm === null ? null : `${area(type.livingAreaSqm)} ${ut("sqm")}`,
      type.bedrooms === null ? null : `${type.bedrooms} ${ut("bed")}`,
    ]
      .filter(Boolean)
      .join(" · "),
    title: ut("ride", { type: type.name }),
    subtitle: type.hasPrivateLift
      ? ut("liftHint")
      : ut("floorsHint", { count: floors.length }),
    floors: floors.map((f) => ({
      id: f.key,
      name: f.floorName,
      // Same fallback the public page's data layer uses (lib/projects.ts).
      shortLabel: liftLabelFor(f.shortLabel, f.floorName) || "?",
      imageUrl: planFor[f.key] ?? f.imageUrl,
      aspect: f.aspect,
      areaLabel: areaOf(f.areaSqm),
      areaRatio: largest > 0 ? (toNumberOrNull(f.areaSqm) ?? 0) / largest : 0,
      rotation: f.portraitRotation,
      rooms: f.rooms
        .filter((r) => Object.values(r.names).some((n) => (n ?? "").trim() !== ""))
        .map((r) => ({
          id: r.key,
          name: Object.values(r.names).find((n) => (n ?? "").trim() !== "") ?? "",
          areaLabel: areaOf(r.areaSqm),
          x: r.xPercent,
          y: r.yPercent,
          photoUrl: r.photoUrl,
        })),
    })),
  };

  // The elevator reads floors[0] unconditionally; the public page never
  // hands it a type without floors, and neither may the preview.
  if (floors.length === 0) {
    return <p className="admin-card text-sm text-ink-muted">{labels.noFloors}</p>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-xs border border-primary/15 p-0.5">
          {(["desktop", "mobile"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onWidth(key)}
              aria-pressed={width === key}
              className={`rounded-xs px-2.5 py-1 text-xs transition-colors ${
                width === key ? "bg-primary font-medium text-white" : "text-ink-muted"
              }`}
            >
              {key === "desktop" ? labels.desktop : labels.mobile}
            </button>
          ))}
        </div>
        <p className="admin-hint">{labels.previewHint}</p>
      </div>

      {/*
        The real component, fed the unsaved draft. A separate preview
        implementation would drift from it, and the drift would surface as
        "it looked right in the admin".
      */}
      {width === "mobile" ? (
        <div className="overflow-hidden rounded-xs border border-primary/15" style={{ maxWidth: 380 }}>
          <UnitTypesElevator
            projectName={projectName}
            types={[elevatorType]}
            labels={labels.elevator}
            variant="preview"
          />
        </div>
      ) : (
        <DesktopFrame>
          <UnitTypesElevator
            projectName={projectName}
            types={[elevatorType]}
            labels={labels.elevator}
            variant="preview"
          />
        </DesktopFrame>
      )}
    </section>
  );
}

/** The width the desktop preview is laid out at before it is scaled down. */
const DESKTOP_WIDTH = 1280;

/*
  Lays its child out at a real desktop width and scales the result down to
  fit the pane.

  Handing the component the pane's own width did not preview the desktop
  page. The pane sits beside the 260px floor list inside the admin shell,
  so at a 1440px screen it is about 840px wide. The board's layout switch is
  a container query at 1000px, so it stacked and turned the plan upright:
  the "Desktop" button showed the phone layout. On wider screens it stayed
  landscape, but the room labels, which are sized in px, piled onto a plan
  drawn at half size. A transform scales the labels with the plan, and it
  leaves layout width alone, so the container query and the elevator's
  ResizeObserver both still see DESKTOP_WIDTH.
*/
function DesktopFrame({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const scale = Math.min(1, o.clientWidth / DESKTOP_WIDTH);
      setBox({ scale, height: i.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="relative overflow-hidden rounded-xs border border-primary/15"
      style={{ height: box.height || undefined }}
    >
      {/* Absolute, so its 1280px never becomes the grid column's min-content
          width and pushes the pane wider than the screen. */}
      <div
        ref={inner}
        className="absolute left-0 top-0"
        style={{
          width: DESKTOP_WIDTH,
          transform: `scale(${box.scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Floors tab ──────────────────────────────────────────────────────────

function FloorsTab({
  locale,
  projectSlug,
  floors,
  floor,
  health,
  lang,
  adminLocales,
  canWrite,
  labels,
  otherTypes,
  onCopyFloor,
  placing,
  selectedRoom,
  onSelectFloor,
  onSelectLang,
  onSelectRoom,
  onTogglePlacing,
  onPatchFloor,
  onPatchRoom,
  onMutate,
}: {
  locale: string;
  projectSlug: string;
  floors: DraftFloor[];
  floor: DraftFloor;
  health: ReturnType<typeof unitTypeHealth>;
  lang: Locale;
  adminLocales: readonly Locale[];
  canWrite: boolean;
  labels: WorkspaceLabels;
  otherTypes: DraftType[];
  onCopyFloor: (targetTypeId: string, floor: DraftFloor) => void;
  placing: boolean;
  selectedRoom: string | null;
  onSelectFloor: (key: string) => void;
  onSelectLang: (value: Locale) => void;
  onSelectRoom: (key: string | null) => void;
  onTogglePlacing: () => void;
  onPatchFloor: (key: string, patch: Partial<DraftFloor>) => void;
  onPatchRoom: (floorKey: string, roomKey: string, patch: Partial<DraftRoom>) => void;
  onMutate: (update: (current: DraftFloor[]) => DraftFloor[]) => void;
}) {
  const index = floors.findIndex((f) => f.key === floor.key);
  const floorHealth = health.floors[index];
  const [copyTarget, setCopyTarget] = useState("");

  const addFloor = () => onMutate((current) => [...current, blankFloor()]);

  const moveFloor = (delta: number) =>
    onMutate((current) => {
      const at = current.findIndex((f) => f.key === floor.key);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= current.length) return current;

      const next = [...current];
      [next[at], next[to]] = [next[to], next[at]];
      return next;
    });

  const deleteFloor = () => onMutate((current) => current.filter((f) => f.key !== floor.key));

  const addRoom = (x: number, y: number) =>
    onMutate((current) =>
      current.map((f) =>
        f.key === floor.key
          ? {
              ...f,
              rooms: [
                ...f.rooms,
                {
                  key: nextKey("room"),
                  id: null,
                  names: {},
                  areaSqm: "",
                  xPercent: x,
                  yPercent: y,
                  photoUrl: null,
                },
              ],
            }
          : f,
      ),
    );

  const deleteRoom = (roomKey: string) =>
    onMutate((current) =>
      current.map((f) =>
        f.key === floor.key ? { ...f, rooms: f.rooms.filter((r) => r.key !== roomKey) } : f,
      ),
    );

  const pins: PinnerRoom[] = floor.rooms.map((room) => ({
    key: room.key,
    label: (room.names[lang] ?? room.names.en ?? "").trim() || "—",
    xPercent: room.xPercent,
    yPercent: room.yPercent,
    hasPhoto: Boolean(room.photoUrl),
  }));

  const roomTotal = floor.rooms.reduce((sum, r) => sum + (toNumberOrNull(r.areaSqm) ?? 0), 0);
  const floorArea = toNumberOrNull(floor.areaSqm);
  const difference = floorArea === null ? null : Math.abs(roomTotal - floorArea);

  return (
    <div className="space-y-4">
      {/* ── Floor strip ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {floors.map((candidate, candidateIndex) => {
          const issues = health.floors[candidateIndex]?.issues.length ?? 0;

          return (
            <button
              key={candidate.key}
              type="button"
              onClick={() => onSelectFloor(candidate.key)}
              aria-pressed={candidate.key === floor.key}
              className={`flex items-center gap-2 rounded-xs border px-3 py-1.5 text-sm transition-colors ${
                candidate.key === floor.key
                  ? "border-accent-700 bg-accent-50 text-primary"
                  : "border-primary/15 text-ink-muted hover:border-accent-700"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full border border-current text-[10px]">
                {candidate.shortLabel || "?"}
              </span>
              {candidate.floorName || labels.floorName}
              <span className="text-xs opacity-70">· {candidate.rooms.length}</span>
              {issues > 0 && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}

        {canWrite && (
          <button type="button" onClick={addFloor} className="admin-btn-ghost">
            <Plus size={14} aria-hidden />
            {labels.addFloor}
          </button>
        )}

        {/*
          Copying a floor to another type. The Victory's A and A+ share a
          second floor exactly — the same drawing, the same twelve rooms —
          and retyping it is both slow and a source of drift between two
          pages that are meant to be identical.

          The copy is detached: fresh draft keys and null database ids, so
          it is created as new rows rather than being confused for the
          original and updated in place on the next save.
        */}
        {canWrite && otherTypes.length > 0 && (
          <span className="flex items-center gap-1">
            <label htmlFor="copy-floor-target" className="sr-only">
              {labels.copyFloor}
            </label>
            <select
              id="copy-floor-target"
              value={copyTarget}
              onChange={(event) => setCopyTarget(event.target.value)}
              className="admin-input max-w-40 py-1 text-xs"
            >
              <option value="">{labels.copyFloor}</option>
              {otherTypes.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={copyTarget === ""}
              onClick={() => {
                onCopyFloor(copyTarget, detachFloor(floor));
                setCopyTarget("");
              }}
              // Icon-only, so it needs a name of its own. Nothing flagged it
              // until a fixture project had a second type to copy to.
              aria-label={labels.copyFloor}
              title={labels.copyFloor}
              className="admin-btn-ghost disabled:opacity-40"
            >
              <Copy size={14} aria-hidden />
            </button>
          </span>
        )}
      </div>

      {/* Issues for the selected floor, named rather than dotted. */}
      {floorHealth && floorHealth.issues.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {floorHealth.issues.map((issue) => (
            <li
              key={issue.kind}
              className="rounded-xs bg-amber-50 px-2 py-1 text-xs text-amber-900"
            >
              {labels.issueLabels[issue.kind]}
              {"count" in issue ? ` · ${issue.count}` : ""}
              {"difference" in issue ? ` · ${issue.difference}` : ""}
            </li>
          ))}
        </ul>
      )}

      <FloorPlanPinner
        lineImageUrl={floor.imageUrl}
        furnishedImageUrl={floor.furnishedImageUrl}
        aspect={floor.aspect}
        rooms={pins}
        selectedKey={selectedRoom}
        placing={placing}
        readOnly={!canWrite}
        labels={labels.pinner}
        onPlace={(x, y) => addRoom(x, y)}
        onMove={(key, x, y) => onPatchRoom(floor.key, key, { xPercent: x, yPercent: y })}
        onSelect={onSelectRoom}
        onTogglePlacing={onTogglePlacing}
        onDeleteSelected={() => selectedRoom && deleteRoom(selectedRoom)}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Floor fields ──────────────────────────────────────── */}
        <section className="admin-card space-y-3">
          <label className="block">
            <span className="admin-label">{labels.floorName}</span>
            <input
              className="admin-input"
              value={floor.floorName}
              disabled={!canWrite}
              onChange={(event) => onPatchFloor(floor.key, { floorName: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="admin-label">{labels.liftLabel}</span>
            <input
              className="admin-input max-w-20"
              maxLength={3}
              value={floor.shortLabel}
              disabled={!canWrite}
              onChange={(event) => onPatchFloor(floor.key, { shortLabel: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="admin-label">{labels.floorArea}</span>
            <input
              className="admin-input max-w-32"
              inputMode="decimal"
              value={floor.areaSqm}
              disabled={!canWrite}
              onChange={(event) => onPatchFloor(floor.key, { areaSqm: event.target.value })}
            />
          </label>

          <fieldset>
            <legend className="admin-label">{labels.rotation}</legend>
            <div className="mt-1 inline-flex rounded-xs border border-primary/15 p-0.5">
              {(["CW", "CCW"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onPatchFloor(floor.key, { portraitRotation: value })}
                  aria-pressed={floor.portraitRotation === value}
                  className={`rounded-xs px-2.5 py-1 text-xs ${
                    floor.portraitRotation === value
                      ? "bg-primary font-medium text-white"
                      : "text-ink-muted"
                  }`}
                >
                  {value === "CW" ? labels.rotationCw : labels.rotationCcw}
                </button>
              ))}
            </div>
            <p className="admin-hint">{labels.rotationHint}</p>
          </fieldset>

          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t border-primary/10 pt-3">
              <button type="button" onClick={() => moveFloor(-1)} className="admin-btn-ghost">
                {labels.moveUp}
              </button>
              <button type="button" onClick={() => moveFloor(1)} className="admin-btn-ghost">
                {labels.moveDown}
              </button>
              <button
                type="button"
                onClick={deleteFloor}
                disabled={floors.length <= 1}
                title={floors.length <= 1 ? labels.lastFloor : undefined}
                className="admin-btn-ghost text-red-700 disabled:opacity-40"
              >
                <Trash2 size={14} aria-hidden />
                {labels.deleteFloor}
              </button>
            </div>
          )}

          {canWrite && (
            <div className="space-y-3 border-t border-primary/10 pt-3">
              <ImageUploader
                name={`line-${floor.key}`}
                prefix="projects"
                slug={projectSlug}
                defaultValue={floor.imageUrl}
                label={labels.lineUpload}
                hint={labels.lineUploadHint}
                // A new drawing makes the saved blueprint stale; the save derives a
                // fresh one, and the preview draws its own until then. Only when
                // the URL really changed: ImageUploader re-fires onChange with
                // the same value on every render (see isNoop), and clearing the
                // blueprint then marked every floor dirty on load.
                onChange={(value) =>
                  onPatchFloor(
                    floor.key,
                    value === floor.imageUrl
                      ? { imageUrl: value }
                      : { imageUrl: value, blueprintImageUrl: null },
                  )
                }
              />
              <ImageUploader
                name={`furnished-${floor.key}`}
                prefix="projects"
                slug={projectSlug}
                defaultValue={floor.furnishedImageUrl ?? ""}
                label={labels.furnishedUpload}
                hint={labels.furnishedUploadHint}
                onChange={(value) =>
                  onPatchFloor(floor.key, { furnishedImageUrl: value || null })
                }
              />
            </div>
          )}
        </section>

        {/* ── Room table ────────────────────────────────────────── */}
        <section className="admin-card p-0!">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-primary">{labels.roomsHeading}</h3>
            {/*
              Not components/admin/LanguageTabs: that switches language by
              navigating to ?lang=, and a navigation here would throw away
              the unsaved draft this whole screen is built around. Same four
              tabs, same completeness dot, driven by state instead.
            */}
            <div className="flex gap-1">
              {(["th", "en", "zh", "ru"] as Locale[]).map((code) => {
                const complete =
                  floor.rooms.length > 0 &&
                  floor.rooms.every((room) => (room.names[code] ?? "").trim() !== "");

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onSelectLang(code)}
                    aria-pressed={code === lang}
                    title={complete ? labels.translationComplete : labels.translationMissing}
                    className={`flex items-center gap-1 rounded-xs px-2 py-1 text-xs uppercase transition-colors ${
                      code === lang
                        ? "bg-primary font-medium text-white"
                        : "text-ink-muted hover:text-primary"
                    }`}
                  >
                    {code}
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        complete ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {floor.rooms.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">{labels.noRooms}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/10 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">{labels.roomName}</th>
                  <th className="px-3 py-2 font-medium">{labels.roomArea}</th>
                  <th className="px-3 py-2 font-medium">{labels.roomPhoto}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>

              <tbody className="divide-y divide-primary/5">
                {floor.rooms.map((room, roomIndex) => {
                  const fallback = (room.names.en ?? "").trim();
                  const value = room.names[lang] ?? "";
                  const untranslated = value.trim() === "" && fallback !== "";

                  return (
                    <tr
                      key={room.key}
                      onClick={() => onSelectRoom(room.key)}
                      className={room.key === selectedRoom ? "bg-accent-50/60" : ""}
                    >
                      <td className="px-3 py-2 tabular-nums text-ink-muted">
                        {String(roomIndex + 1).padStart(2, "0")}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          className="admin-input"
                          value={value}
                          placeholder={untranslated ? fallback : ""}
                          /*
                            A column header is not an accessible name — axe
                            reports these as critical without one, and a
                            screen reader lands on thirty unnamed text
                            boxes. Numbered, because "room name" thirty
                            times is no more use than nothing.
                          */
                          aria-label={`${labels.roomName} ${roomIndex + 1}`}
                          disabled={!canWrite}
                          onChange={(event) =>
                            onPatchRoom(floor.key, room.key, {
                              names: { ...room.names, [lang]: event.target.value },
                            })
                          }
                        />
                        {untranslated && (
                          <span className="mt-0.5 block text-[11px] text-amber-800">
                            {labels.untranslated}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          className="admin-input max-w-24"
                          inputMode="decimal"
                          value={room.areaSqm}
                          aria-label={`${labels.roomArea} ${roomIndex + 1}`}
                          disabled={!canWrite}
                          onChange={(event) =>
                            onPatchRoom(floor.key, room.key, { areaSqm: event.target.value })
                          }
                        />
                      </td>

                      <td className="px-3 py-2">
                        <RoomPhotoCell
                          locale={locale}
                          photoUrl={room.photoUrl}
                          canWrite={canWrite}
                          labels={labels}
                          onChange={(url) => onPatchRoom(floor.key, room.key, { photoUrl: url })}
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => deleteRoom(room.key)}
                            aria-label={labels.deleteRoom}
                            className="text-ink-muted hover:text-red-700"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-primary/10 text-xs">
                  <td />
                  <td className="px-3 py-2 text-ink-muted">{labels.roomTotal}</td>
                  <td className="px-3 py-2 font-medium tabular-nums text-primary">
                    {roomTotal.toFixed(2)}
                  </td>
                  <td colSpan={2} className="px-3 py-2">
                    {difference !== null &&
                      (difference <= 0.6 ? (
                        <span className="text-emerald-700">{labels.areaMatches}</span>
                      ) : (
                        <span className="text-amber-800">
                          {labels.areaDiffers} {difference.toFixed(2)}
                        </span>
                      ))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

/** Thumbnail plus the library picker for one room's photo. */
function RoomPhotoCell({
  locale,
  photoUrl,
  canWrite,
  labels,
  onChange,
}: {
  locale: string;
  photoUrl: string | null;
  canWrite: boolean;
  labels: WorkspaceLabels;
  onChange: (url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="flex items-center gap-2">
      {photoUrl ? (
        /* A 32px thumbnail of whatever the library holds, the same call
           MediaLibrary.tsx makes for its own tiles and for the same reason:
           these URLs span more than one media host (see next.config.js's
           remotePatterns) and none of them benefit from optimisation at
           this size. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" loading="lazy" className="h-8 w-12 rounded-xs object-cover" />
      ) : (
        <span className="grid h-8 w-12 place-items-center rounded-xs bg-surface-muted text-[10px] text-ink-muted">
          —
        </span>
      )}

      {canWrite && (
        <span className="flex flex-col items-start gap-0.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-primary underline"
          >
            {labels.pickPhoto}
          </button>

          {photoUrl && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-ink-muted underline hover:text-red-700"
            >
              {labels.clearPhoto}
            </button>
          )}
        </span>
      )}

      {/*
        Mounted only while open. MediaLibraryPicker fetches the whole
        library when its `open` turns true, and a room table is thirty of
        these — thirty idle pickers would each hold a copy of it.
      */}
      {open && (
        <MediaLibraryPicker
          open={open}
          locale={locale as Locale}
          loadingLabel={labels.pickPhoto}
          onSelect={(item) => {
            onChange(item.url);
            setOpen(false);
          }}
        />
      )}
    </span>
  );
}
