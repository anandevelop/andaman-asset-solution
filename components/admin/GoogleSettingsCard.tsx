"use client";

/**
 * components/admin/GoogleSettingsCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "ค่าการเชื่อมต่อ" for Google: the GA4 tag ID, the GA4 property and the
 * Search Console property, and the service account key file that lets the
 * SEO screens read them. The key file is write-only — the page is told the
 * account's email and where it comes from, never the key.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, CircleMinus, Loader2, Upload, Zap } from "lucide-react";
import type {
  GoogleSaveResult,
  testGoogleConnectionAction,
} from "@/app/[locale]/admin/(system)/settings/integrations/google-actions";
import type { GoogleCheck } from "@/lib/google-check";

export type GoogleCardLabels = Record<string, string>;

type Props = {
  initial: { gaMeasurementId: string; ga4PropertyId: string; gscSiteUrl: string };
  account: { email: string | null; source: "admin" | "env" | null; undecryptable: boolean };
  envHints: { ga4PropertyId: string | null; gscSiteUrl: string | null };
  labels: GoogleCardLabels;
  save: (input: unknown) => Promise<GoogleSaveResult>;
  test: typeof testGoogleConnectionAction;
};

export default function GoogleSettingsCard({ initial, account, envHints, labels, save, test }: Props) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [json, setJson] = useState("");
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const [saved, setSaved] = useState<GoogleSaveResult | null>(null);
  const [check, setCheck] = useState<{ result: GoogleCheck; email: string | null } | { error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const L = (key: string, fallback?: string) => labels[key] ?? fallback ?? key;

  function onSave(remove = false) {
    setSaved(null);
    startSaving(async () => {
      const result = await save({ ...values, serviceAccountJson: json || undefined, removeServiceAccount: remove });
      setSaved(result);
      if (result.ok) {
        setJson("");
        router.refresh();
      }
    });
  }

  function onTest() {
    setCheck(null);
    startTesting(async () => {
      const outcome = await test({ ...values, serviceAccountJson: json || undefined });
      setCheck(outcome.ok ? { result: outcome.result, email: outcome.email } : { error: outcome.error });
    });
  }

  const accountPlaceholder = account.email
    ? L(account.source === "env" ? "jsonPlaceholderEnv" : "jsonPlaceholderSaved").replace("{email}", account.email)
    : L("jsonPlaceholderNone");

  const field = (key: keyof typeof values, label: string, hint: string, placeholder?: string) => (
    <label className="block">
      <span className="admin-label">{label}</span>
      <input
        value={values[key]}
        onChange={set(key)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="admin-input mt-1"
      />
      <span className="admin-hint mt-1 block">{hint}</span>
    </label>
  );

  const step = (name: string, value: GoogleCheck[keyof GoogleCheck]) => {
    const Icon = value.skipped ? CircleMinus : value.ok ? CircleCheck : CircleAlert;
    const tone = value.skipped ? "text-adm-muted" : value.ok ? "text-adm-success" : "text-adm-danger";
    const code = value.detail?.split(":")[0] ?? "";
    const hint = !value.ok && !value.skipped ? labels[`hint.${code}`] : undefined;
    return (
      <li className={`flex items-start gap-2 ${tone}`}>
        <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{name}</span>
          {value.skipped ? ` — ${L("skipped")}` : value.ok ? ` — ${L("ok")}${value.detail ? ` (${value.detail})` : ""}` : ""}
          {!value.ok && !value.skipped && value.detail && <span className="block text-xs">{value.detail}</span>}
          {hint && <span className="mt-0.5 block text-xs text-adm-text">{hint}</span>}
        </span>
      </li>
    );
  };

  return (
    <section className="admin-card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-adm-text">{L("title")}</h3>
        {account.email && (
          <span className="rounded-full bg-adm-success-bg px-2.5 py-1 text-xs font-medium text-adm-success">
            {L(account.source === "env" ? "statusEnv" : "statusAdmin")}
          </span>
        )}
      </div>

      {account.undecryptable && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">
          {L("undecryptable")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {field("gaMeasurementId", L("gaMeasurementId"), L("gaMeasurementIdHint"), "G-XXXXXXXXXX")}
        {field("ga4PropertyId", L("ga4PropertyId"), L("ga4PropertyIdHint"), envHints.ga4PropertyId ?? "123456789")}
        {field("gscSiteUrl", L("gscSiteUrl"), L("gscSiteUrlHint"), envHints.gscSiteUrl ?? "sc-domain:andamanassetsolution.com")}
      </div>

      <label className="block">
        <span className="admin-label">{L("serviceAccount")}</span>
        <textarea
          value={json}
          onChange={(event) => setJson(event.target.value)}
          placeholder={accountPlaceholder}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          className="admin-input mt-1 font-mono text-xs"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setJson(await file.text());
            event.target.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="admin-btn-ghost">
          <Upload size={14} aria-hidden />
          {L("pickFile")}
        </button>
        <span className="admin-hint">{L("storedNote")}</span>
        {account.source === "admin" && (
          <button
            type="button"
            onClick={() => onSave(true)}
            disabled={saving}
            className="admin-btn-ghost ml-auto text-adm-danger!"
          >
            {L("removeAccount")}
          </button>
        )}
      </div>

      {check && (
        <div className="rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm">
          {"error" in check ? (
            <p className="text-adm-danger">{L(`err.${check.error}`, check.error)}</p>
          ) : (
            <>
              {check.email && <p className="mb-2 text-xs text-adm-muted">{check.email}</p>}
              <ul className="space-y-1.5">
                {step(L("stepToken"), check.result.token)}
                {step("Search Console", check.result.searchConsole)}
                {step("Google Analytics 4", check.result.analytics)}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved?.ok && (
          <span className="inline-flex items-center gap-1 text-xs text-adm-success">
            <Check size={13} aria-hidden />
            {L("saved")}
          </span>
        )}
        {saved && !saved.ok && <span className="text-xs text-adm-danger">{L(`err.${saved.error}`, saved.error)}</span>}
        <button type="button" onClick={onTest} disabled={testing} className="admin-btn-ghost">
          {testing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Zap size={14} aria-hidden />}
          {L("test")}
        </button>
        <button type="button" onClick={() => onSave(false)} disabled={saving} className="admin-btn">
          {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
          {L("save")}
        </button>
      </div>
    </section>
  );
}
