"use client";

/**
 * components/admin/ProjectForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One form shared by create and edit. The parent binds the right server
 * action, so this component never needs to know which mode it is in.
 *
 * Uses useFormState/useFormStatus rather than react-hook-form: the payload
 * is plain FormData, validation is authoritative on the server, and this
 * way the form still submits with JavaScript disabled.
 *
 * name/tagline/description/conceptDesign/aboutThisProject/metaTitle/
 * metaDescription are translated — see ProjectTranslation in
 * schema.prisma. `lang` selects which locale this instance shows/saves;
 * the edit/new pages own the language selector — see AwardForm's file
 * comment for the fuller version of this note.
 *
 * The Special Features section (SpecialFeaturesEditor) was removed from
 * this form by request — the field/schema/public-page rendering are left
 * in place (still nullable/harmless), only the admin input is gone, so no
 * migration is needed and any project that already has rows saved just
 * keeps rendering them on the public page until edited again.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { PROJECT_STATUSES, PROPERTY_TYPES } from "@/lib/validations";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import type { Locale } from "@/i18n";
import type { ProjectFormState } from "@/app/[locale]/admin/projects/actions";

export type ProjectFormValues = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  conceptDesign: string;
  conceptDesignImageUrl: string;
  aboutThisProject: string;
  aboutThisProjectImageUrl: string;
  /** JSON-serialized SpecialFeatureRow[] — see SpecialFeaturesEditor. */
  specialFeatures: string;
  location: string;
  propertyType: string;
  status: string;
  landAreaSqm: string;
  projectArea: string;
  totalUnits: string;
  facilities: string;
  heroImageUrl: string;
  /** "IMAGE" | "VIDEO" — see the mediaType radio below and the
   *  schema.prisma comment on Project.heroMediaType. */
  heroMediaType: string;
  heroVideoUrl: string;
  gallery: string;
  brochureUrl: string;
  masterPlanImageUrl: string;
  latitude: string;
  longitude: string;
  googleMapsUrl: string;
  metaTitle: string;
  metaDescription: string;
  isPublished: boolean;
  sortOrder: string;
};

export const EMPTY_PROJECT: ProjectFormValues = {
  slug: "",
  name: "",
  tagline: "",
  description: "",
  conceptDesign: "",
  conceptDesignImageUrl: "",
  aboutThisProject: "",
  aboutThisProjectImageUrl: "",
  specialFeatures: "[]",
  location: "",
  propertyType: "POOL_VILLA",
  status: "UPCOMING",
  landAreaSqm: "",
  projectArea: "",
  totalUnits: "",
  facilities: "",
  heroImageUrl: "",
  heroMediaType: "IMAGE",
  heroVideoUrl: "",
  gallery: "",
  brochureUrl: "",
  masterPlanImageUrl: "",
  latitude: "",
  longitude: "",
  googleMapsUrl: "",
  metaTitle: "",
  metaDescription: "",
  isPublished: false,
  sortOrder: "0",
};

type Props = {
  locale: string;
  lang: Locale;
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  values?: ProjectFormValues;
  onDelete?: () => Promise<void>;
  submitLabel: string;
};

const INITIAL: ProjectFormState = { ok: false };

/**
 * Label + control + error, defined at module scope. Declaring it inside the
 * component would give it a new identity on every render, remounting each
 * uncontrolled input and wiping whatever the editor had typed.
 */
function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label htmlFor={name} className="admin-label">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="admin-hint">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function DeleteButton({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmLabel)) event.preventDefault();
      }}
      className="admin-btn-danger"
    >
      <Trash2 size={15} aria-hidden />
      {label}
    </button>
  );
}

export default function ProjectForm({
  locale,
  lang,
  action,
  values = EMPTY_PROJECT,
  onDelete,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  // The public `projects` namespace already translates every enum label —
  // reuse it rather than maintaining a second copy under `admin`.
  const tEnum = useTranslations("projects");
  const [state, formAction] = useFormState(action, INITIAL);
  // Purely for conditional field visibility, same pattern as
  // HeroStorySlideForm's mediaType radio — every field stays uncontrolled,
  // this only toggles which uploader renders.
  const [heroMediaType, setHeroMediaType] = useState<"IMAGE" | "VIDEO">(
    values.heroMediaType === "VIDEO" ? "VIDEO" : "IMAGE",
  );

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    return code === "SLUG_TAKEN" ? t("projects.slugTaken") : code;
  };

  return (
    <>
      <form id="project-form" action={formAction} className="space-y-8">
      <input type="hidden" name="locale" value={lang} />

      {state.ok && state.message === "SAVED" && (
        <SaveToast tone="success" token={state}>
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      {!state.ok && state.message === "SAVE_FAILED" && (
        <SaveToast tone="error" token={state}>
          <AlertCircle size={16} aria-hidden />
          {t("common.error")}
        </SaveToast>
      )}

      {/* ── Identity ────────────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <Field name="name"
        error={err("name")} label={`${t("projects.name")} · ${lang.toUpperCase()}`}>
          <input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            className="admin-input"
          />
        </Field>

        <Field name="slug"
          error={err("slug")} label={t("projects.slug")} hint={t("projects.slugHint")}>
          <input
            id="slug"
            name="slug"
            defaultValue={values.slug}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="admin-input font-mono"
          />
        </Field>

        <Field name="location"
          error={err("location")} label={t("projects.location")}>
          <input
            id="location"
            name="location"
            defaultValue={values.location}
            required
            className="admin-input"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="propertyType"
          error={err("propertyType")} label={t("projects.propertyType")}>
            <select
              id="propertyType"
              name="propertyType"
              defaultValue={values.propertyType}
              className="admin-input"
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tEnum(`propertyType.${type}` as never)}
                </option>
              ))}
            </select>
          </Field>

          <Field name="status"
          error={err("status")} label={t("projects.status")}>
            <select
              id="status"
              name="status"
              defaultValue={values.status}
              className="admin-input"
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tEnum(`status.${status}` as never)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* ── Copy ────────────────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <h2 className="admin-section-title">{`${t("projects.tagline")} · ${lang.toUpperCase()}`}</h2>

        <Field name="tagline" error={err("tagline")} label="">
          <input
            id="tagline"
            name="tagline"
            defaultValue={values.tagline}
            className="admin-input"
          />
        </Field>

        <h2 className="admin-section-title pt-2">{`${t("projects.description")} · ${lang.toUpperCase()}`}</h2>

        <Field name="description" error={err("description")} label="">
          <textarea
            id="description"
            name="description"
            defaultValue={values.description}
            className="admin-textarea"
          />
        </Field>

        <h2 className="admin-section-title pt-2">{`${t("projects.conceptDesign")} · ${lang.toUpperCase()}`}</h2>
        <p className="admin-hint -mt-3">{t("projects.conceptDesignHint")}</p>

        <Field name="conceptDesign" error={err("conceptDesign")} label="">
          <textarea
            id="conceptDesign"
            name="conceptDesign"
            defaultValue={values.conceptDesign}
            rows={6}
            className="admin-textarea"
          />
        </Field>

        <ImageUploader
          name="conceptDesignImageUrl"
          prefix="projects"
          slug={values.slug}
          defaultValue={values.conceptDesignImageUrl}
          label={t("projects.conceptDesignImage")}
          hint={t("projects.conceptDesignImageHint")}
        />

        <h2 className="admin-section-title pt-2">{`${t("projects.aboutThisProject")} · ${lang.toUpperCase()}`}</h2>
        <p className="admin-hint -mt-3">{t("projects.aboutThisProjectHint")}</p>

        <Field name="aboutThisProject" error={err("aboutThisProject")} label="">
          <textarea
            id="aboutThisProject"
            name="aboutThisProject"
            defaultValue={values.aboutThisProject}
            rows={6}
            className="admin-textarea"
          />
        </Field>

        <ImageUploader
          name="aboutThisProjectImageUrl"
          prefix="projects"
          slug={values.slug}
          defaultValue={values.aboutThisProjectImageUrl}
          label={t("projects.aboutThisProjectImage")}
          hint={t("projects.aboutThisProjectImageHint")}
        />

        {/* Special Features section removed from the admin form by request.
            A hidden input carries the existing value through unchanged so
            saving the rest of this form doesn't silently wipe any rows a
            project already has. */}
        <input type="hidden" name="specialFeatures" defaultValue={values.specialFeatures} />
      </section>

      {/* ── Specification ───────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field name="totalUnits"
          error={err("totalUnits")} label={t("projects.units")}>
            <input
              id="totalUnits"
              name="totalUnits"
              type="number"
              min="0"
              defaultValue={values.totalUnits}
              className="admin-input"
            />
          </Field>

          <Field name="landAreaSqm"
          error={err("landAreaSqm")} label={t("projects.landArea")}>
            <input
              id="landAreaSqm"
              name="landAreaSqm"
              type="number"
              min="0"
              step="0.01"
              defaultValue={values.landAreaSqm}
              className="admin-input"
            />
          </Field>

          <Field name="projectArea"
          error={err("projectArea")} label="Project Area (Text)">
            <input
              id="projectArea"
              name="projectArea"
              placeholder="e.g. 16 Rai 1 Ngan 57.40 sq.wa."
              defaultValue={values.projectArea}
              className="admin-input"
            />
          </Field>
        </div>

        {/* Legacy field — the public page's Facilities section now reads
            ProjectFacility rows (photo cards) via "Manage facilities" on
            the project list/edit header instead. Left in place, not
            removed, so nothing already reading this column breaks; see
            the @deprecated note on Project.facilities in schema.prisma. */}
        <Field
          name="facilities"
          error={err("facilities")}
          label={t("projects.facilities")}
          hint={t("projects.facilitiesHint")}
        >
          <textarea
            id="facilities"
            name="facilities"
            defaultValue={values.facilities}
            rows={4}
            className="admin-textarea font-mono text-xs"
          />
        </Field>

        {/* Latitude/Longitude inputs removed from the admin form by
            request — the Google Maps link field below now covers both
            "Get Directions" and the map preview (see
            lib/google-maps.ts), so a separate coordinate pair isn't
            something the team expects to fill in anymore. Hidden inputs
            carry any value a project already has through unchanged: it
            still feeds the public page's JSON-LD geo block and, for
            projects that have it, is still tried before the Maps link as
            the map preview's source (see the hasCoords check in
            app/[locale]/(site)/projects/[slug]/page.tsx) — no migration
            or data loss, just no admin UI to edit it going forward. */}
        <input type="hidden" name="latitude" defaultValue={values.latitude} />
        <input type="hidden" name="longitude" defaultValue={values.longitude} />

        <Field
          name="googleMapsUrl"
          error={err("googleMapsUrl")}
          label={t("projects.googleMapsUrl")}
          hint={t("projects.googleMapsUrlHint")}
        >
          <input
            id="googleMapsUrl"
            name="googleMapsUrl"
            type="url"
            placeholder="https://maps.app.goo.gl/..."
            defaultValue={values.googleMapsUrl}
            className="admin-input"
          />
        </Field>
      </section>

      {/* ── Imagery ─────────────────────────────────────────────────── */}
      <section className="admin-card space-y-6">
        {/* ── Hero media type ─────────────────────────────────────────
            Same radio + conditional-uploader pattern as
            HeroStorySlideForm's mediaType — IMAGE uses heroImageUrl
            alone; VIDEO uses heroVideoUrl for the background and keeps
            heroImageUrl as the poster/fallback shown until the video can
            play. Both uploaders always render so switching back and
            forth never loses whichever one was already filled in. */}
        <div>
          <span className="admin-label">{t("projects.heroMediaType")}</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="heroMediaType"
                value="IMAGE"
                checked={heroMediaType === "IMAGE"}
                onChange={() => setHeroMediaType("IMAGE")}
                className="h-4 w-4 border-primary/30 text-primary focus:ring-primary/30"
              />
              {t("projects.heroMediaTypeImage")}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="heroMediaType"
                value="VIDEO"
                checked={heroMediaType === "VIDEO"}
                onChange={() => setHeroMediaType("VIDEO")}
                className="h-4 w-4 border-primary/30 text-primary focus:ring-primary/30"
              />
              {t("projects.heroMediaTypeVideo")}
            </label>
          </div>
        </div>

        <ImageUploader
          name="heroImageUrl"
          prefix="projects"
          slug={values.slug}
          defaultValue={values.heroImageUrl}
          label={
            heroMediaType === "VIDEO"
              ? t("projects.heroImagePoster")
              : t("projects.heroImage")
          }
          hint={heroMediaType === "VIDEO" ? t("projects.heroImagePosterHint") : undefined}
        />

        {heroMediaType === "VIDEO" && (
          <ImageUploader
            name="heroVideoUrl"
            prefix="projects"
            slug={values.slug}
            acceptVideo
            defaultValue={values.heroVideoUrl}
            label={t("projects.heroVideo")}
            hint={t("projects.heroVideoHint")}
          />
        )}

        <ImageUploader
          name="gallery"
          prefix="projects"
          slug={values.slug}
          defaultValue={values.gallery}
          multiple
          label={t("projects.gallery")}
          hint={t("projects.galleryHint")}
        />

        <ImageUploader
          name="masterPlanImageUrl"
          prefix="projects"
          slug={values.slug}
          defaultValue={values.masterPlanImageUrl}
          label="Master Plan Image"
          hint="ภาพผังโครงการสำหรับ Interactive Map"
        />

        <ImageUploader
          name="brochureUrl"
          prefix="brochures"
          slug={values.slug}
          defaultValue={values.brochureUrl}
          kind="document"
          label={t("projects.brochure")}
          hint={t("projects.brochureHint")}
        />
      </section>

      {/* ── SEO ─────────────────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <h2 className="admin-section-title">{t("projects.seo")}</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="metaTitle"
          error={err("metaTitle")} label={`${t("projects.metaTitle")} · ${lang.toUpperCase()}`}>
            <input
              id="metaTitle"
              name="metaTitle"
              defaultValue={values.metaTitle}
              className="admin-input"
            />
          </Field>

          <Field name="metaDescription"
          error={err("metaDescription")} label={`${t("projects.metaDescription")} · ${lang.toUpperCase()}`}>
            <textarea
              id="metaDescription"
              name="metaDescription"
              defaultValue={values.metaDescription}
              rows={3}
              className="admin-textarea"
            />
          </Field>
        </div>
      </section>

      {/* ── Publication ─────────────────────────────────────────────── */}
      <section className="admin-card space-y-5">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="isPublished"
            defaultChecked={values.isPublished}
            className="mt-0.5 h-4 w-4 rounded-sm border-primary/30 text-primary focus:ring-primary/30"
          />
          <span>{t("projects.publish")}</span>
        </label>

        <Field
          name="sortOrder"
          error={err("sortOrder")}
          label={t("projects.sortOrder")}
          hint={t("projects.sortOrderHint")}
        >
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            defaultValue={values.sortOrder}
            className="admin-input max-w-[140px]"
          />
        </Field>
      </section>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label={submitLabel} />

          <Link href={`/${locale}/admin/projects`} className="admin-btn-ghost">
            {t("common.cancel")}
          </Link>
        </div>
      </form>

      {/*
        Delete is its own form, not a second button inside the one above:
        forms cannot nest, and a submit button inside the edit form would
        fire the save action instead.
      */}
      {onDelete && (
        <form
          action={onDelete}
          className="mt-10 border-t border-primary/10 pt-6"
        >
          <DeleteButton
            label={t("common.delete")}
            confirmLabel={t("common.confirmDelete")}
          />
        </form>
      )}
    </>
  );
}
