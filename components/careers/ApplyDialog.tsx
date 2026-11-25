"use client";

/**
 * components/careers/ApplyDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The job application, in two steps and a receipt:
 *
 *   1. the applicant notice and a consent tick — nothing can be typed, and
 *      no file leaves the browser, until it is given;
 *   2. seven fields: position, first and last name, email, phone,
 *      education, expected salary, and optional attachments;
 *   3. "we have your application".
 *
 * A native <dialog>, opened with showModal(): the browser supplies the
 * focus trap, Escape, the inert page behind and the backdrop, which is
 * most of what a modal library is for.
 *
 * Attachments upload as soon as they are chosen, straight to storage, and
 * the form holds only the token each upload came back with — see
 * lib/careers/files.ts for the flow and why it is shaped that way.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check, CircleCheck, FileText, Loader2, Upload, X } from "lucide-react";
import { useRecaptchaToken } from "@/components/RecaptchaProvider";
import {
  EDUCATION_LEVELS,
  FILE_ACCEPT,
  FILE_TYPES,
  MAX_FILES,
  MAX_FILE_BYTES,
  applicationSchema,
  fieldErrors,
} from "@/lib/careers/fields";
import type { PublicPosition } from "@/lib/careers/positions";

type Props = {
  locale: string;
  positions: PublicPosition[];
  initialPositionId: string;
  retentionMonths: number;
  hrEmail: string;
  onClose: () => void;
};

type Attached = { id: string; name: string; size: number; token: string | null; error: string | null };

const MB = MAX_FILE_BYTES / 1024 / 1024;

const INPUT =
  "w-full rounded-xs border border-primary/20 bg-white px-4 py-3 text-base text-ink outline-hidden transition-colors focus:border-ink aria-invalid:border-red-700 sm:text-sm";
const LABEL = "mb-1.5 block text-xs font-medium text-ink";
const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xs border border-ink bg-surface-muted px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-ink transition-colors [:lang(th)_&]:text-sm [:lang(th)_&]:tracking-normal hover:bg-surface-raised disabled:cursor-not-allowed disabled:border-ink/25 disabled:text-ink/50";
const QUIET = "inline-flex items-center gap-2 py-3 text-sm text-ink/65 transition-colors hover:text-ink";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function ApplyDialog({ locale, positions, initialPositionId, retentionMonths, hrEmail, onClose }: Props) {
  const t = useTranslations("careers.form");
  const tTypes = useTranslations("careers.types");
  const getRecaptchaToken = useRecaptchaToken();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [step, setStep] = useState<"notice" | "form" | "done">("notice");
  const [consent, setConsent] = useState(false);
  const [values, setValues] = useState({
    positionId: initialPositionId,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    education: "",
    expectedSalary: "",
    company: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Attached[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const message = (code: string | undefined) => {
    if (!code) return null;
    const known = ["REQUIRED", "EMAIL_INVALID", "PHONE_INVALID", "SALARY_INVALID", "CONSENT_REQUIRED", "TOO_MANY_FILES", "TYPE_NOT_ALLOWED", "TOO_LARGE", "EMPTY", "UPLOAD_FAILED", "UPLOADS_UNAVAILABLE", "RATE_LIMITED", "POSITION_CLOSED", "RECAPTCHA_FAILED"]; // prettier-ignore
    return t(`errors.${known.includes(code) ? code : "GENERIC"}` as never, { max: MAX_FILES, mb: MB } as never);
  };

  /* One file: ask for a ticket, PUT the bytes to storage, keep the token. */
  async function upload(file: File) {
    const id = crypto.randomUUID();
    const fail = (error: string) =>
      setFiles((list) => list.map((entry) => (entry.id === id ? { ...entry, error } : entry)));

    setFiles((list) => [...list, { id, name: file.name, size: file.size, token: null, error: null }]);

    if (!(file.type in FILE_TYPES)) return fail("TYPE_NOT_ALLOWED");
    if (file.size <= 0) return fail("EMPTY");
    if (file.size > MAX_FILE_BYTES) return fail("TOO_LARGE");

    try {
      const response = await fetch("/api/careers/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
      });
      const ticket = (await response.json().catch(() => null)) as
        | { ok: true; uploadUrl: string; headers: Record<string, string>; token: string; name: string }
        | { ok: false; error: string }
        | null;
      if (!ticket || !ticket.ok) return fail(ticket?.error ?? "UPLOAD_FAILED");

      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
      if (!put.ok) return fail("UPLOAD_FAILED");

      setFiles((list) =>
        list.map((entry) => (entry.id === id ? { ...entry, name: ticket.name, token: ticket.token } : entry)),
      );
    } catch {
      fail("UPLOAD_FAILED");
    }
  }

  function addFiles(chosen: FileList | null) {
    if (!chosen) return;
    setFileError(null);
    const room = MAX_FILES - files.filter((file) => !file.error).length;
    const picked = [...chosen];
    if (picked.length > room) setFileError("TOO_MANY_FILES");
    picked.slice(0, Math.max(0, room)).forEach((file) => void upload(file));
  }

  const uploading = files.some((file) => !file.token && !file.error);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || uploading) return;

    const payload = {
      ...values,
      locale,
      consent,
      files: files.flatMap((file) => (file.token ? [file.token] : [])),
    };
    const checked = applicationSchema.safeParse(payload);
    if (!checked.success) {
      setErrors(fieldErrors(checked.error));
      return;
    }

    setSending(true);
    setErrors({});
    try {
      const recaptchaToken = await getRecaptchaToken("job_application");
      const response = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, recaptchaToken: recaptchaToken ?? undefined }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok: true; droppedFiles?: number }
        | { ok: false; error: string; fields?: Record<string, string> }
        | null;

      if (result?.ok) {
        setDropped(result.droppedFiles ?? 0);
        setStep("done");
      } else if (result && result.error === "VALIDATION_FAILED" && result.fields) {
        setErrors(result.fields);
      } else {
        setErrors({ form: result?.error ?? "GENERIC" });
      }
    } catch {
      setErrors({ form: "GENERIC" });
    } finally {
      setSending(false);
    }
  }

  const position = positions.find((entry) => entry.id === values.positionId);
  const attachedCount = files.filter((file) => file.token).length;

  const field = (key: keyof typeof values, label: React.ReactNode, input: React.ReactNode) => (
    <div>
      <label htmlFor={`apply-${key}`} className={LABEL}>
        {label}
      </label>
      {input}
      {errors[key] && (
        <p id={`apply-${key}-error`} className="mt-1 text-xs text-red-800">
          {message(errors[key])}
        </p>
      )}
    </div>
  );
  const describe = (key: keyof typeof values) => ({
    id: `apply-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `apply-${key}-error` : undefined,
  });

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // A press on the backdrop lands on the <dialog> itself; anything
      // inside it lands on a descendant.
      onClick={(event) => {
        if (event.target === event.currentTarget && step !== "form") dialog.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[min(100vw-1.5rem,34rem)] max-w-none overflow-y-auto rounded-xs border border-ink/15 bg-white p-0 text-ink shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] backdrop:bg-black/45"
    >
      {step !== "done" && (
        <header className="border-b border-ink/10 px-5 pb-4 pt-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.26em] text-ink/70">JOIN OUR TEAM</p>
              <h2 id={titleId} className="mt-1.5 text-2xl font-light text-ink">
                {t("title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label={t("close")}
              className="-mr-2 -mt-1 grid h-9 w-9 place-items-center text-ink/65 hover:text-ink"
            >
              <X size={20} aria-hidden />
            </button>
          </div>

          <ol className="mt-4 flex items-center gap-3 text-xs">
            {(["notice", "form"] as const).map((name, index) => {
              const current = step === name;
              const passed = step === "form" && name === "notice";
              return (
                <li
                  key={name}
                  aria-current={current ? "step" : undefined}
                  className={`flex items-center gap-2 ${current ? "font-medium text-ink" : "text-ink/65"}`}
                >
                  {index > 0 && <span aria-hidden className="mr-1 h-px w-6 bg-ink/25" />}
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border text-[10.5px] ${
                      current ? "border-ink bg-surface-muted" : "border-ink/30"
                    }`}
                  >
                    {passed ? <Check size={11} strokeWidth={3} aria-hidden /> : index + 1}
                  </span>
                  {t(name === "notice" ? "stepNotice" : "stepForm")}
                </li>
              );
            })}
          </ol>
        </header>
      )}

      {step === "notice" && (
        <div className="px-5 pb-6 pt-5 sm:px-7">
          <p className="text-[0.92rem] font-light leading-relaxed text-ink/75">{t("noticeLead")}</p>

          <dl
            // From a tablet up the notice scrolls in its own box, so the
            // consent tick stays in view. On a phone that would be a scroll
            // inside a scroll: there the whole dialog scrolls instead, and
            // the tick is reached by reading down to it.
            tabIndex={0}
            className="mt-4 rounded-xs border border-ink/15 bg-surface px-4 text-sm sm:max-h-[42vh] sm:overflow-y-auto"
          >
            {(["collect", "purpose", "who", "retention", "rights"] as const).map((key) => (
              <div key={key} className="border-b border-ink/10 py-3 last:border-b-0">
                <dt className="text-[0.82rem] font-medium text-ink">{t(`notice.${key}Title`)}</dt>
                <dd className="mt-0.5 font-light leading-relaxed text-ink/75">
                  {t(`notice.${key}`, { months: retentionMonths, email: hrEmail })}
                </dd>
              </div>
            ))}
          </dl>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xs border border-ink p-3.5 text-sm leading-relaxed text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-black"
            />
            <span>{t("agree")}</span>
          </label>

          <div className="mt-5 flex flex-col-reverse gap-x-4 gap-y-1 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => dialog.current?.close()} className={QUIET}>
              {t("decline")}
            </button>
            <button type="button" disabled={!consent} onClick={() => setStep("form")} className={BUTTON}>
              {t("continue")}
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {step === "form" && (
        <form onSubmit={submit} noValidate className="space-y-4 px-5 pb-6 pt-5 sm:px-7">
          {field(
            "positionId",
            t("position"),
            <select {...describe("positionId")} value={values.positionId} onChange={set("positionId")} className={INPUT}>
              {positions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} · {tTypes(entry.employmentType)}
                </option>
              ))}
            </select>,
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              "firstName",
              t("firstName"),
              <input {...describe("firstName")} value={values.firstName} onChange={set("firstName")} autoComplete="given-name" maxLength={80} className={INPUT} />,
            )}
            {field(
              "lastName",
              t("lastName"),
              <input {...describe("lastName")} value={values.lastName} onChange={set("lastName")} autoComplete="family-name" maxLength={80} className={INPUT} />,
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              "email",
              t("email"),
              <input {...describe("email")} type="email" inputMode="email" value={values.email} onChange={set("email")} autoComplete="email" maxLength={160} className={INPUT} />,
            )}
            {field(
              "phone",
              t("phone"),
              <input {...describe("phone")} type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" maxLength={24} className={INPUT} />,
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              "education",
              t("education"),
              <select {...describe("education")} value={values.education} onChange={set("education")} className={INPUT}>
                <option value="">{t("chooseEducation")}</option>
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(`educationLevels.${level}`)}
                  </option>
                ))}
              </select>,
            )}
            {field(
              "expectedSalary",
              <>
                {t("salary")} <span className="font-normal text-ink/65">({t("salaryUnit")})</span>
              </>,
              <input
                {...describe("expectedSalary")}
                inputMode="numeric"
                value={values.expectedSalary}
                // Digits only, so "35,000" and "35000 บาท" both end up as a number.
                onChange={(event) => {
                  setValues((current) => ({ ...current, expectedSalary: event.target.value.replace(/\D/g, "").slice(0, 8) }));
                  setErrors((current) => ({ ...current, expectedSalary: "" }));
                }}
                className={INPUT}
              />,
            )}
          </div>

          {/* The honeypot. Off-screen rather than display:none, which some
              bots check for; aria-hidden and tabIndex keep people out. */}
          <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label>
              Company
              <input tabIndex={-1} autoComplete="off" value={values.company} onChange={set("company")} />
            </label>
          </div>

          <div>
            <p className={LABEL}>
              {t("files")} <span className="font-normal text-ink/65">{t("filesHint")}</span>
            </p>
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
              className="block cursor-pointer rounded-xs border border-dashed border-ink/35 bg-surface px-4 py-4 text-center text-sm text-ink/75 focus-within:border-ink"
            >
              <Upload size={20} strokeWidth={1.4} aria-hidden className="mx-auto" />
              <span className="mt-1 block">
                <span className="text-ink underline underline-offset-4">{t("chooseFile")}</span> {t("dropHint")}
              </span>
              <span className="mt-0.5 block text-xs text-ink/65">{t("fileLimits", { mb: MB, max: MAX_FILES })}</span>
              <input
                type="file"
                multiple
                accept={FILE_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  // So choosing the same file again after removing it fires.
                  event.target.value = "";
                }}
              />
            </label>
            {fileError && <p className="mt-1 text-xs text-red-800">{message(fileError)}</p>}

            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((file) => (
                  <li key={file.id} className="rounded-xs border border-ink/15 px-3 py-2 text-[0.82rem]">
                    <div className="flex items-center gap-2.5">
                      {file.token || file.error ? (
                        <FileText size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                      ) : (
                        <Loader2 size={16} aria-hidden className="shrink-0 animate-spin" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-ink/65">
                        {file.token || file.error ? sizeLabel(file.size) : t("uploading")}
                      </span>
                      <button
                        type="button"
                        aria-label={t("remove", { name: file.name })}
                        onClick={() => setFiles((list) => list.filter((entry) => entry.id !== file.id))}
                        className="grid h-6 w-6 shrink-0 place-items-center text-ink/65 hover:text-ink"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                    {file.error && <p className="mt-1 text-xs text-red-800">{message(file.error)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {errors.form && (
            <p role="alert" className="rounded-xs border border-red-800/40 bg-red-50 px-3 py-2 text-sm text-red-900">
              {message(errors.form)}
            </p>
          )}

          <div className="flex flex-col-reverse gap-x-4 gap-y-1 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStep("notice")} className={QUIET}>
              <ArrowLeft size={15} strokeWidth={1.5} aria-hidden />
              {t("back")}
            </button>
            <button type="submit" disabled={sending || uploading} className={BUTTON}>
              {sending ? t("submitting") : t("submit")}
              {!sending && <ArrowRight size={16} strokeWidth={1.5} aria-hidden />}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="px-6 pb-8 pt-10 text-center sm:px-8">
          <CircleCheck size={36} strokeWidth={1.2} aria-hidden className="mx-auto" />
          <h2 id={titleId} className="mt-4 text-2xl font-light text-ink">
            {t("success.title")}
          </h2>
          <p className="mx-auto mt-2 max-w-[34ch] font-light leading-relaxed text-ink/75">{t("success.body")}</p>

          <dl className="mt-6 border-t border-ink/15 text-left text-sm">
            {(
              [
                [t("success.position"), position?.title ?? "—"],
                [t("success.name"), `${values.firstName} ${values.lastName}`.trim()],
                [t("success.attachments"), attachedCount - dropped > 0 ? t("success.fileCount", { count: attachedCount - dropped }) : t("success.none")],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-ink/10 py-2.5">
                <dt className="text-ink/65">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>

          {dropped > 0 && (
            <p className="mt-4 text-sm text-red-900">{t("success.droppedFiles", { count: dropped, email: hrEmail })}</p>
          )}

          <button type="button" onClick={() => dialog.current?.close()} className={`${BUTTON} mt-6`}>
            {t("close")}
          </button>
        </div>
      )}
    </dialog>
  );
}
