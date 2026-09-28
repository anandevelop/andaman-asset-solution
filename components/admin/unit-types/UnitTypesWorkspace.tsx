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
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import type { Locale } from "@/i18n";
import ImageUploader from "@/components/admin/ImageUploader";
import MediaLibraryPicker from "@/components/admin/MediaLibraryPicker";
import SaveToast from "@/components/admin/SaveToast";
import UnitTypesElevator from "@/components/unit-types/UnitTypesElevator";
import type { ElevatorLabels, ElevatorType } from "@/components/unit-types/types";
import { unitTypeHealth, type FloorIssue } from "@/lib/admin/unit-type-health";
import type { UnitTypeFloorsInput } from "@/lib/validations";
import FloorPlanPinner, { type PinnerRoom } from "./FloorPlanPinner";

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
  issues: string;
  desktop: string;
  mobile: string;
  previewHint: string;
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
  labels,
  onSave,
}: Props) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [tab, setTab] = useState<"details" | "floors" | "preview">("floors");
  const [lang, setLang] = useState<Locale>(adminLocales[0] ?? "en");
  const [floorsByType, setFloorsByType] = useState(initialFloorsByType);
  const [floorKey, setFloorKey] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [pending, startTransition] = useTransition();

  const saved = useRef(initialFloorsByType);

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
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const mutate = useCallback(
    (update: (current: DraftFloor[]) => DraftFloor[]) => {
      if (!type) return;
      setFloorsByType((current) => ({
        ...current,
        [type.id]: update(current[type.id] ?? []),
      }));
      setDirty(true);
    },
    [type],
  );

  const patchFloor = useCallback(
    (key: string, patch: Partial<DraftFloor>) =>
      mutate((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f))),
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

  const save = () => {
    if (!type) return;

    startTransition(async () => {
      const payload = {
        floors: floors.map((f, index) => ({
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
      };

      const outcome = await onSave(type.id, payload);
      setResult(outcome);

      if (outcome.ok) {
        saved.current = { ...saved.current, [type.id]: floors };
        setDirty(false);
      }
    });
  };

  const discard = () => {
    setFloorsByType(saved.current);
    setDirty(false);
    setResult(null);
  };

  if (!type) {
    return <p className="admin-card text-sm text-ink-muted">{labels.noRooms}</p>;
  }

  return (
    <div className="space-y-5">
      {result && (
        <SaveToast tone={result.ok ? "success" : "error"} token={result}>
          {result.ok ? <Check size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
          {result.ok ? labels.saved : labels.saveFailed}
        </SaveToast>
      )}

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* ── Type list ───────────────────────────────────────────── */}
        <aside className="admin-card h-fit p-0!">
          <h2 className="border-b border-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            {labels.typeList}
          </h2>

          <ul className="divide-y divide-primary/5">
            {types.map((candidate) => {
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
                <li key={candidate.id}>
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
                      <span
                        className={`rounded-xs px-1.5 py-0.5 text-[11px] font-medium ${
                          issues === 0
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        {issues === 0 ? labels.complete : `${issues} ${labels.issues}`}
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

          {tab === "details" && <DetailsTab type={type} floors={floors} labels={labels} />}

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
      {canWrite && dirty && (
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
  type,
  floors,
  labels,
}: {
  type: DraftType;
  floors: DraftFloor[];
  labels: WorkspaceLabels;
}) {
  const total = floors.reduce((sum, f) => sum + (toNumberOrNull(f.areaSqm) ?? 0), 0);

  return (
    <section className="admin-card space-y-3 text-sm">
      <Field label={labels.floorName} value={type.name} />
      <Field label="Code" value={type.code ?? "—"} />
      <Field
        label={labels.roomTotal}
        value={`${total.toFixed(2)} (${floors.length})`}
      />
      <p className="admin-hint">{labels.previewHint}</p>
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
  type,
  floors,
  projectName,
  width,
  labels,
  onWidth,
}: {
  type: DraftType;
  floors: DraftFloor[];
  projectName: string;
  width: "desktop" | "mobile";
  labels: WorkspaceLabels;
  onWidth: (value: "desktop" | "mobile") => void;
}) {
  const largest = Math.max(...floors.map((f) => toNumberOrNull(f.areaSqm) ?? 0), 0);

  const elevatorType: ElevatorType = {
    id: type.id,
    name: type.name,
    code: type.code ?? type.name,
    bedrooms: type.bedrooms === null ? "—" : String(type.bedrooms),
    bathrooms: type.bathrooms === null ? "—" : String(type.bathrooms),
    totalAreaLabel: type.livingAreaSqm === null ? null : type.livingAreaSqm.toFixed(2),
    chipMeta: type.name,
    title: type.name,
    subtitle: "",
    floors: floors.map((f) => ({
      id: f.key,
      name: f.floorName,
      shortLabel: f.shortLabel || "?",
      imageUrl: f.imageUrl,
      aspect: f.aspect,
      areaLabel: f.areaSqm.trim() === "" ? null : f.areaSqm,
      areaRatio: largest > 0 ? (toNumberOrNull(f.areaSqm) ?? 0) / largest : 0,
      rotation: f.portraitRotation,
      rooms: f.rooms
        .filter((r) => Object.values(r.names).some((n) => (n ?? "").trim() !== ""))
        .map((r) => ({
          id: r.key,
          name: Object.values(r.names).find((n) => (n ?? "").trim() !== "") ?? "",
          areaLabel: r.areaSqm.trim() === "" ? null : r.areaSqm,
          x: r.xPercent,
          y: r.yPercent,
          photoUrl: r.photoUrl,
        })),
    })),
  };

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
      <div
        className="overflow-hidden rounded-xs border border-primary/15"
        style={width === "mobile" ? { maxWidth: 380 } : undefined}
      >
        <UnitTypesElevator
          projectName={projectName}
          types={[elevatorType]}
          labels={labels.elevator}
          variant="preview"
        />
      </div>
    </section>
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

  const addFloor = () =>
    onMutate((current) => [
      ...current,
      {
        key: nextKey("floor"),
        id: null,
        floorName: "",
        shortLabel: "",
        areaSqm: "",
        imageUrl: "",
        furnishedImageUrl: null,
        aspect: 2.8,
        portraitRotation: "CW",
        rooms: [],
      },
    ]);

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
                onChange={(value) => onPatchFloor(floor.key, { imageUrl: value })}
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
