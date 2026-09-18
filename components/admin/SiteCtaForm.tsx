"use client";

/**
 * components/admin/SiteCtaForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One closing-CTA block. Doubles as the "add" form and the inline editor
 * for an existing one, the same arrangement as CorporateServiceForm.
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT
 *
 * The words are: eyebrow, headline, standfirst and both button labels.
 * The destinations are not — a URL has no language, and four copies of one
 * link is four chances for three of them to go stale. `lang` selects which
 * locale's words this instance shows and saves; the page owns the single
 * language selector shared by every block on it.
 *
 * THE HEADLINE PREVIEW
 *
 * The headline and standfirst are ICU messages, so a sentence can count
 * the published developments instead of naming a number that goes stale.
 * That is only safe if the editor can see what it produces, so the preview
 * under each field renders the message against the real current count —
 * and against a different one, so it is obvious which words move. Formatted
 * with next-intl's own translator, the same one the public page uses.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createTranslator, useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, Lock, Trash2 } from "lucide-react";
import ImageUploader from "@/components/admin/ImageUploader";
import SaveToast from "@/components/admin/SaveToast";
import { CTA_LINK_KINDS, type CtaLinkKindValue } from "@/lib/validations";
import type { Locale } from "@/i18n";
import type { SiteCtaFormState } from "@/app/[locale]/admin/(content)/pages/home/cta/actions";

export type SiteCtaValues = {
  name: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: string;
  backgroundImageUrl: string;
  primaryKind: CtaLinkKindValue;
  primaryHref: string;
  secondaryKind: CtaLinkKindValue;
  secondaryHref: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
};

export const EMPTY_SITE_CTA: SiteCtaValues = {
  name: "",
  isActive: true,
  isDefault: false,
  sortOrder: "0",
  backgroundImageUrl: "",
  primaryKind: "PAGE",
  primaryHref: "/contact",
  secondaryKind: "WHATSAPP",
  secondaryHref: "",
  eyebrow: "",
  title: "",
  subtitle: "",
  primaryLabel: "",
  secondaryLabel: "",
};

type Props = {
  lang: Locale;
  action: (state: SiteCtaFormState, formData: FormData) => Promise<SiteCtaFormState>;
  onDelete?: (state: SiteCtaFormState) => Promise<SiteCtaFormState>;
  /** Locked shut on the default block — every page without a placement of
   *  its own is relying on it. */
  deleteLocked?: boolean;
  values?: SiteCtaValues;
  submitLabel: string;
  /** Published developments right now, so the preview shows what visitors
   *  are actually reading rather than a made-up number. */
  projectCount: number;
  /** Locale-relative paths offered as suggestions for a PAGE link. */
  pagePaths: readonly string[];
};

const INITIAL: SiteCtaFormState = { ok: false };

/**
 * The counting syntax, shown next to the headline field.
 *
 * A plain JavaScript string rather than a translated message: ICU syntax
 * is the same in every language, and putting braces in a message file
 * would mean escaping every one of them — in four files, where the
 * escaping is the first thing a future edit would get wrong.
 */
const COUNT_EXAMPLE = "{count, plural, =3 {all three} other {all #}}";

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

/**
 * What the message says right now, and what it would say with one more
 * development — the second line is the whole reason a counted sentence is
 * worth writing, and the only way to see it without publishing a project.
 */
function MessagePreview({
  message,
  locale,
  count,
  nowLabel,
  thenLabel,
  errorLabel,
}: {
  message: string;
  locale: string;
  count: number;
  nowLabel: string;
  thenLabel: string;
  errorLabel: string;
}) {
  const rendered = useMemo(() => {
    if (!message.trim()) return null;

    let failed = false;
    /* Named `format`, not `t`: this is an inline one-message translator,
       and a second `t` in a file that already has a namespace-bound one
       reads as the same thing to a person and to tests/i18n.test.ts. */
    const format = createTranslator({
      locale,
      messages: { value: message },
      onError: () => {
        failed = true;
      },
      getMessageFallback: () => "",
    });

    const now = format("value", { count });
    const then = format("value", { count: count + 1 });

    return failed ? null : { now, then, counted: now !== then };
  }, [message, locale, count]);

  if (!message.trim()) return null;

  if (!rendered) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-700">
        <AlertCircle size={13} aria-hidden />
        {errorLabel}
      </p>
    );
  }

  return (
    <div className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
      <p>
        <span className="text-ink/45">{nowLabel}</span> {rendered.now}
      </p>
      {/* Only when the number actually moves the words — on a sentence with
          no {count} in it, a second identical line is noise. */}
      {rendered.counted && (
        <p>
          <span className="text-ink/45">{thenLabel}</span> {rendered.then}
        </p>
      )}
    </div>
  );
}

/** Kind + destination + label for one button. The destination field is
 *  shown only for the kinds that have one; WhatsApp and the office number
 *  come from Settings, and NONE hides the button altogether. */
function ButtonFields({
  side,
  legend,
  values,
  lang,
  pagePaths,
  err,
}: {
  side: "primary" | "secondary";
  legend: string;
  values: SiteCtaValues;
  lang: Locale;
  pagePaths: readonly string[];
  err: (name: string) => string | null;
}) {
  const t = useTranslations("admin.cta");
  const [kind, setKind] = useState<CtaLinkKindValue>(values[`${side}Kind`]);

  /* Every field below is labelled through htmlFor/id rather than by sitting
     next to a <label>. There are up to two of these fieldsets per block and
     one block per card on the page, so the ids have to be unique per
     instance — which is what useId is for. */
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const needsHref = kind === "PAGE" || kind === "URL";

  return (
    <fieldset className="rounded-xs border border-primary/10 p-4">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {legend}
      </legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="admin-label" htmlFor={fieldId("kind")}>
            {t("linkKind")}
          </label>
          <select
            id={fieldId("kind")}
            name={`${side}Kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value as CtaLinkKindValue)}
            className="admin-input w-auto! max-w-[240px]"
          >
            {CTA_LINK_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`linkKinds.${option}`)}
              </option>
            ))}
          </select>
        </div>

        {kind !== "NONE" && (
          <div>
            <label className="admin-label" htmlFor={fieldId("label")}>
              {`${t("buttonLabel")} · ${lang.toUpperCase()}`}
            </label>
            <input
              id={fieldId("label")}
              name={`${side}Label`}
              defaultValue={values[`${side}Label`]}
              className="admin-input"
            />
            {err(`${side}Label`) && (
              <p className="mt-1.5 text-xs text-red-700">{err(`${side}Label`)}</p>
            )}
          </div>
        )}
      </div>

      {/* Always submitted, even while hidden: a kind switched to WhatsApp
          and back should not silently lose the path that was typed. */}
      <div className={needsHref ? "mt-4" : "hidden"}>
        <label className="admin-label" htmlFor={fieldId("href")}>
          {t("href")}
        </label>
        <input
          id={fieldId("href")}
          name={`${side}Href`}
          defaultValue={values[`${side}Href`]}
          list="cta-page-paths"
          className="admin-input"
        />
        <p className="admin-hint">{kind === "URL" ? t("hrefUrlHint") : t("hrefPageHint")}</p>
        {err(`${side}Href`) && (
          <p className="mt-1.5 text-xs text-red-700">{err(`${side}Href`)}</p>
        )}
      </div>

      {kind === "WHATSAPP" && <p className="admin-hint mt-3">{t("fromSettingsWhatsapp")}</p>}
      {kind === "PHONE" && <p className="admin-hint mt-3">{t("fromSettingsPhone")}</p>}

      <datalist id="cta-page-paths">
        {pagePaths.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
    </fieldset>
  );
}

export default function SiteCtaForm({
  lang,
  action,
  onDelete,
  deleteLocked = false,
  values = EMPTY_SITE_CTA,
  submitLabel,
  projectCount,
  pagePaths,
}: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("admin.cta");
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [state, formAction] = useActionState(action, INITIAL);
  const [deleteState, deleteAction] = useActionState(
    onDelete ?? (async (previous: SiteCtaFormState) => previous),
    INITIAL,
  );

  const [title, setTitle] = useState(values.title);
  const [subtitle, setSubtitle] = useState(values.subtitle);

  const err = (name: string) => state.fields?.[name] ?? null;

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="locale" value={lang} />

        {state.ok && (
          <SaveToast tone="success" token={state}>
            <CheckCircle2 size={15} aria-hidden />
            {t("common.saved")}
          </SaveToast>
        )}

        {!state.ok && state.message === "SAVE_FAILED" && (
          <SaveToast tone="error" token={state}>
            <AlertCircle size={15} aria-hidden />
            {t("common.error")}
          </SaveToast>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor={fieldId("name")}>
              {tc("name")}
            </label>
            <input
              id={fieldId("name")}
              name="name"
              defaultValue={values.name}
              required
              className="admin-input"
            />
            <p className="admin-hint">{tc("nameHint")}</p>
            {err("name") && <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>}
          </div>

          <div>
            <label className="admin-label" htmlFor={fieldId("sortOrder")}>
              {tc("sortOrder")}
            </label>
            <input
              id={fieldId("sortOrder")}
              name="sortOrder"
              type="number"
              defaultValue={values.sortOrder}
              className="admin-input w-auto! max-w-40"
            />
          </div>
        </div>

        {/* ── Words ─────────────────────────────────────────────────── */}
        <div>
          <label className="admin-label" htmlFor={fieldId("eyebrow")}>
            {`${tc("eyebrow")} · ${lang.toUpperCase()}`}
          </label>
          <input
            id={fieldId("eyebrow")}
            name="eyebrow"
            defaultValue={values.eyebrow}
            className="admin-input"
          />
          <p className="admin-hint">{tc("eyebrowHint")}</p>
        </div>

        <div>
          <label className="admin-label" htmlFor={fieldId("title")}>
            {`${tc("headline")} · ${lang.toUpperCase()}`}
          </label>
          <input
            id={fieldId("title")}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="admin-input"
          />
          <p className="admin-hint">
            {tc("headlineHint")}{" "}
            <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink">
              {COUNT_EXAMPLE}
            </code>
          </p>
          <MessagePreview
            message={title}
            locale={lang}
            count={projectCount}
            nowLabel={tc("previewNow")}
            thenLabel={tc("previewThen")}
            errorLabel={tc("previewError")}
          />
          {err("title") && <p className="mt-1.5 text-xs text-red-700">{err("title")}</p>}
        </div>

        <div>
          <label className="admin-label" htmlFor={fieldId("subtitle")}>
            {`${tc("standfirst")} · ${lang.toUpperCase()}`}
          </label>
          <textarea
            id={fieldId("subtitle")}
            name="subtitle"
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            rows={2}
            className="admin-input"
          />
          <MessagePreview
            message={subtitle}
            locale={lang}
            count={projectCount}
            nowLabel={tc("previewNow")}
            thenLabel={tc("previewThen")}
            errorLabel={tc("previewError")}
          />
          {err("subtitle") && <p className="mt-1.5 text-xs text-red-700">{err("subtitle")}</p>}
        </div>

        {/* ── Buttons ───────────────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <ButtonFields
            side="primary"
            legend={tc("primary")}
            values={values}
            lang={lang}
            pagePaths={pagePaths}
            err={err}
          />
          <ButtonFields
            side="secondary"
            legend={tc("secondary")}
            values={values}
            lang={lang}
            pagePaths={pagePaths}
            err={err}
          />
        </div>

        {/* ── Background ────────────────────────────────────────────── */}
        <ImageUploader
          name="backgroundImageUrl"
          prefix="cta"
          defaultValue={values.backgroundImageUrl}
          label={tc("image")}
          hint={tc("imageHint")}
        />

        <div className="space-y-3 border-t border-primary/10 pt-5">
          <label className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={values.isActive}
              className="h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
            />
            {tc("active")}
          </label>

          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={values.isDefault}
              className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
            />
            <span>
              {tc("isDefault")}
              <span className="mt-0.5 block text-xs text-ink-muted">{tc("isDefaultHint")}</span>
            </span>
          </label>
        </div>

        <SubmitButton label={submitLabel} />
      </form>

      {/* Separate form — a nested submit would fire the save action. */}
      {onDelete && (
        <form action={deleteAction} className="mt-5 border-t border-primary/10 pt-5">
          {deleteLocked ? (
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <Lock size={13} aria-hidden />
              {tc("deleteLocked")}
            </p>
          ) : (
            <DeleteButton label={t("common.delete")} confirmLabel={t("common.confirmDelete")} />
          )}

          {!deleteState.ok && deleteState.message === "DEFAULT_LOCKED" && (
            <p className="mt-3 text-xs text-red-700">{tc("deleteLocked")}</p>
          )}
          {!deleteState.ok && deleteState.message === "SAVE_FAILED" && (
            <p className="mt-3 text-xs text-red-700">{t("common.error")}</p>
          )}
        </form>
      )}
    </>
  );
}
