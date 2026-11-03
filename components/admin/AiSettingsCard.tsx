"use client";

/**
 * components/admin/AiSettingsCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Gemini key behind "AI เขียน alt" in the media library. The key is
 * write-only here: the page is told only where it comes from (saved here,
 * the server's .env, or nowhere), never the key itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { AiActionResult } from "@/app/[locale]/admin/(system)/settings/integrations/ai-actions";

export type AiCardLabels = Record<
  | "title"
  | "subtitle"
  | "statusAdmin"
  | "statusEnv"
  | "statusNone"
  | "undecryptable"
  | "keyLabel"
  | "keyPlaceholderNew"
  | "keyPlaceholderKeep"
  | "keyHint"
  | "getKey"
  | "modelLabel"
  | "modelHint"
  | "save"
  | "saved"
  | "removeKey"
  | "err.BAD_KEY"
  | "err.BAD_MODEL"
  | "err.UNREACHABLE"
  | "err.INVALID_INPUT"
  | "err.FORBIDDEN"
  | "err.SAVE_FAILED",
  string
>;

type Props = {
  locale: string;
  keySource: "admin" | "env" | null;
  model: string;
  modelIsSaved: boolean;
  defaultModel: string;
  undecryptable: boolean;
  labels: AiCardLabels;
  save: (input: { geminiKey?: string; model?: string; clearKey?: boolean }) => Promise<AiActionResult>;
};

export default function AiSettingsCard({
  keySource,
  model,
  modelIsSaved,
  defaultModel,
  undecryptable,
  labels,
  save,
}: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [modelValue, setModelValue] = useState(modelIsSaved ? model : "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AiActionResult | null>(null);

  function submit(input: { geminiKey?: string; model?: string; clearKey?: boolean }) {
    setResult(null);
    startTransition(async () => {
      const outcome = await save(input);
      setResult(outcome);
      if (outcome.ok) {
        setKey("");
        router.refresh();
      }
    });
  }

  const status =
    keySource === "admin" ? labels.statusAdmin : keySource === "env" ? labels.statusEnv : labels.statusNone;

  return (
    <section className="admin-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
            <Sparkles size={15} className="text-adm-accent-ink" aria-hidden />
            {labels.title}
          </h3>
          <p className="admin-hint mt-1 max-w-xl">{labels.subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            keySource ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-muted"
          }`}
        >
          {status}
        </span>
      </div>

      {undecryptable && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">
          {labels.undecryptable}
        </p>
      )}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit({ geminiKey: key || undefined, model: modelValue });
        }}
      >
        <label className="block">
          <span className="admin-label">{labels.keyLabel}</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={keySource ? labels.keyPlaceholderKeep : labels.keyPlaceholderNew}
            className="admin-input mt-1 font-mono text-xs"
          />
          <span className="admin-hint mt-1 flex flex-wrap items-center gap-x-2">
            {labels.keyHint}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-adm-accent-ink underline"
            >
              {labels.getKey}
              <ExternalLink size={11} aria-hidden />
            </a>
          </span>
        </label>

        <label className="block">
          <span className="admin-label">{labels.modelLabel}</span>
          <input
            value={modelValue}
            onChange={(event) => setModelValue(event.target.value)}
            placeholder={defaultModel}
            spellCheck={false}
            className="admin-input mt-1 font-mono text-xs"
          />
          <span className="admin-hint mt-1 block">{labels.modelHint}</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="admin-btn">
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {labels.save}
          </button>
          {keySource === "admin" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => submit({ clearKey: true })}
              className="admin-btn-ghost text-adm-danger!"
            >
              {labels.removeKey}
            </button>
          )}
          {result?.ok && (
            <span className="inline-flex items-center gap-1 text-xs text-adm-success">
              <Check size={13} aria-hidden />
              {labels.saved}
            </span>
          )}
          {result && !result.ok && (
            <span className="text-xs text-adm-danger">
              {labels[`err.${result.error}` as keyof AiCardLabels] ?? result.error}
              {result.detail ? ` — ${result.detail}` : ""}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
