"use client";

/**
 * components/admin/LineSettingsCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * LINE lead alerts, on /admin/settings/integrations.
 *
 * Four parts, in the order an admin sets them up: the connection (channel
 * secret + access token, write-only), the webhook URL to paste into the
 * LINE Developers console, the chats that receive alerts, and a test.
 *
 * The credentials never come back to the browser. The card is told only
 * whether each is set and where from (back office or environment).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Users,
  User,
} from "lucide-react";
import { showUndoToast } from "@/components/admin/UndoToast";
import {
  addLineDestinationAction,
  removeLineDestinationAction,
  saveLineCredentialsAction,
  sendLineTestAction,
  setLineEnabledAction,
  updateLineDestinationAction,
  type LineActionResult,
} from "@/app/[locale]/admin/(system)/settings/integrations/line-actions";

export type LineCardDestination = {
  id: string;
  type: "group" | "room" | "user";
  name: string;
  enabled: boolean;
  source: "join" | "manual" | "env";
};

type Source = "admin" | "env" | null;

export type LineCardLabels = Record<
  | "title"
  | "subtitle"
  | "statusConnected"
  | "statusNoToken"
  | "statusNoChat"
  | "statusOff"
  | "masterSwitch"
  | "connection"
  | "channelSecret"
  | "channelSecretHint"
  | "accessToken"
  | "accessTokenHint"
  | "isSet"
  | "isSetEnv"
  | "notSet"
  | "replace"
  | "remove"
  | "saveConnection"
  | "undecryptable"
  | "webhook"
  | "webhookHint"
  | "copy"
  | "copied"
  | "chats"
  | "chatsHint"
  | "chatsEmpty"
  | "typeGroup"
  | "typeRoom"
  | "typeUser"
  | "fromEnv"
  | "newChat"
  | "unnamed"
  | "rename"
  | "addById"
  | "addByIdHint"
  | "namePlaceholder"
  | "add"
  | "test"
  | "testHint"
  | "testOne"
  | "saved"
  | "testSent"
  | "steps"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "quotaNote"
  | "err.FORBIDDEN"
  | "err.SAVE_FAILED"
  | "err.INVALID_INPUT"
  | "err.BAD_SECRET"
  | "err.BAD_TOKEN"
  | "err.BAD_ID"
  | "err.NOT_FOUND"
  | "err.RATE_LIMITED"
  | "err.NO_TOKEN"
  | "err.NO_RECIPIENTS"
  | "err.SEND_FAILED"
  | "deliveries"
  | "deliveriesEmpty"
  | "kindLead"
  | "kindRegistration"
  | "kindTest"
  | "outcomeSent"
  | "outcomeFailed"
  | "outcomeSkipped"
  | "reason.SWITCHED_OFF"
  | "reason.NO_TOKEN"
  | "reason.NO_ACTIVE_CHAT"
  | "reason.NOT_CONFIGURED",
  string
>;

export type LineCardDelivery = {
  at: string;
  kind: "lead" | "registration" | "test";
  outcome: "sent" | "failed" | "skipped";
  detail: string;
};

type Props = {
  locale: string;
  enabled: boolean;
  secretSource: Source;
  tokenSource: Source;
  undecryptable: boolean;
  bot: { displayName: string; basicId: string; pictureUrl?: string } | null;
  webhookUrl: string;
  destinations: LineCardDestination[];
  deliveries: LineCardDelivery[];
  /** BCP-47 tag for dates, e.g. th-TH-u-ca-buddhist. */
  locale_tag: string;
  labels: LineCardLabels;
};

function Switch({
  on,
  label,
  disabled,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-adm-success" : "bg-adm-text/20",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3.5 w-3.5 transform rounded-full bg-adm-solid shadow-xs transition-transform",
          on ? "translate-x-[18px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

export default function LineSettingsCard(props: Props) {
  const { locale, labels: l } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null);

  const run = (action: () => Promise<LineActionResult>, success?: (r: LineActionResult) => string) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        showUndoToast({ message: success ? success(result) : l.saved });
        router.refresh();
      } else {
        const key = `err.${result.error}` as keyof LineCardLabels;
        setError({ text: l[key] ?? result.error, detail: result.detail });
      }
    });
  };

  const hasToken = props.tokenSource !== null;
  const activeChats = props.destinations.filter((d) => d.enabled).length;
  const status = !props.enabled
    ? { tone: "muted", text: l.statusOff }
    : !hasToken || !props.bot
      ? { tone: "warning", text: l.statusNoToken }
      : activeChats === 0
        ? { tone: "warning", text: l.statusNoChat }
        : { tone: "success", text: l.statusConnected.replace("{name}", props.bot.displayName) };

  const credentialRow = (
    kind: "secret" | "token",
    label: string,
    hint: string,
    source: Source,
    value: string,
    setValue: (v: string) => void,
  ) => (
    <div>
      <label className="admin-label" htmlFor={`line-${kind}`}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`line-${kind}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="admin-input admin-mono min-w-0 flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={source ? `•••••••• — ${l.replace}` : ""}
        />
        <span
          className={`inline-flex items-center gap-1 text-xs ${source ? "text-adm-success" : "text-adm-muted"}`}
        >
          {source ? <Check size={12} aria-hidden /> : null}
          {source === "admin" ? l.isSet : source === "env" ? l.isSetEnv : l.notSet}
        </span>
        {source === "admin" && (
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-ghost"
            disabled={pending}
            onClick={() => run(() => saveLineCredentialsAction(locale, { clear: [kind] }))}
          >
            {l.remove}
          </button>
        )}
      </div>
      <p className="admin-hint mt-1">{hint}</p>
    </div>
  );

  return (
    <section className="admin-card space-y-6" aria-labelledby="line-card-title">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xs bg-[#06C755] text-white">
          <MessageCircle size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="line-card-title" className="text-base font-semibold text-adm-text">
            {l.title}
          </h3>
          <p className="text-sm text-adm-muted">{l.subtitle}</p>
          <p
            className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium ${
              status.tone === "success"
                ? "text-adm-success"
                : status.tone === "warning"
                  ? "text-adm-warning"
                  : "text-adm-muted"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {status.text}
            {props.bot && (
              <span className="admin-mono font-normal text-adm-muted">· {props.bot.basicId}</span>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-adm-text">
          {l.masterSwitch}
          <Switch
            on={props.enabled}
            label={l.masterSwitch}
            disabled={pending}
            onChange={() => run(() => setLineEnabledAction(locale, !props.enabled))}
          />
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xs border border-adm-danger/30 bg-adm-danger/8 px-3 py-2.5 text-sm text-adm-danger"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>{error.text}</p>
            {error.detail && (
              <pre className="admin-mono mt-1 whitespace-pre-wrap text-xs opacity-80">{error.detail}</pre>
            )}
          </div>
        </div>
      )}

      {props.undecryptable && (
        <p className="flex items-start gap-2 text-sm text-adm-warning">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {l.undecryptable}
        </p>
      )}

      {/* 1. Connection */}
      <div className="space-y-4">
        <h4 className="admin-section-title">{l.connection}</h4>
        {credentialRow("secret", l.channelSecret, l.channelSecretHint, props.secretSource, secret, setSecret)}
        {credentialRow("token", l.accessToken, l.accessTokenHint, props.tokenSource, token, setToken)}
        <button
          type="button"
          className="admin-btn admin-btn-sm"
          disabled={pending || (!secret.trim() && !token.trim())}
          onClick={() =>
            run(async () => {
              const r = await saveLineCredentialsAction(locale, {
                channelSecret: secret || undefined,
                accessToken: token || undefined,
              });
              if (r.ok) {
                setSecret("");
                setToken("");
              }
              return r;
            })
          }
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
          {l.saveConnection}
        </button>
      </div>

      {/* 2. Webhook */}
      <div>
        <h4 className="admin-section-title">{l.webhook}</h4>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="admin-mono min-w-0 flex-1 truncate rounded-xs border border-adm-line bg-adm-text/4 px-3 py-2 text-sm">
            {props.webhookUrl}
          </code>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(props.webhookUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? l.copied : l.copy}
          </button>
        </div>
        <p className="admin-hint mt-1">{l.webhookHint}</p>
      </div>

      {/* 3. Chats */}
      <div>
        <h4 className="admin-section-title">{l.chats}</h4>
        <p className="admin-hint mt-1">{l.chatsHint}</p>

        {props.destinations.length === 0 ? (
          <p className="mt-3 rounded-xs border border-dashed border-adm-line px-4 py-5 text-center text-sm text-adm-muted">
            {l.chatsEmpty}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-adm-line rounded-xs border border-adm-line">
            {props.destinations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-adm-text/6 text-adm-muted">
                  {d.type === "user" ? <User size={15} aria-hidden /> : <Users size={15} aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-adm-text">
                    {d.name || l.unnamed}
                    <span className="text-xs font-normal text-adm-muted">
                      {d.type === "group" ? l.typeGroup : d.type === "room" ? l.typeRoom : l.typeUser}
                    </span>
                    {d.source === "env" && <span className="text-xs font-normal text-adm-muted">· {l.fromEnv}</span>}
                    {d.source === "join" && !d.enabled && (
                      <span className="rounded-full bg-adm-warning/15 px-2 py-0.5 text-[11px] font-medium text-adm-warning">
                        {l.newChat}
                      </span>
                    )}
                  </p>
                  <p className="admin-mono truncate text-xs text-adm-muted">{d.id}</p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-ghost"
                  disabled={pending}
                  onClick={() => {
                    const name = window.prompt(l.rename, d.name);
                    if (name !== null) run(() => updateLineDestinationAction(locale, d.id, { name }));
                  }}
                >
                  {l.rename}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-ghost"
                  disabled={pending || !d.enabled || !hasToken}
                  title={l.testOne}
                  aria-label={l.testOne}
                  onClick={() => run(() => sendLineTestAction(locale, d.id), () => l.testSent)}
                >
                  <Send size={14} aria-hidden />
                </button>
                <Switch
                  on={d.enabled}
                  label={d.name || d.id}
                  disabled={pending}
                  onChange={() => run(() => updateLineDestinationAction(locale, d.id, { enabled: !d.enabled }))}
                />
                {d.source !== "env" && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-ghost text-adm-danger"
                    aria-label={l.remove}
                    title={l.remove}
                    disabled={pending}
                    onClick={() => run(() => removeLineDestinationAction(locale, d.id))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-adm-muted">{l.addById}</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="admin-input admin-mono min-w-0 flex-1"
              placeholder="C… / U…"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              spellCheck={false}
            />
            <input
              className="admin-input w-48"
              placeholder={l.namePlaceholder}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              className="admin-btn admin-btn-sm"
              disabled={pending || !newId.trim()}
              onClick={() =>
                run(async () => {
                  const r = await addLineDestinationAction(locale, newId, newName);
                  if (r.ok) {
                    setNewId("");
                    setNewName("");
                  }
                  return r;
                })
              }
            >
              <Plus size={14} aria-hidden />
              {l.add}
            </button>
          </div>
          <p className="admin-hint mt-1">{l.addByIdHint}</p>
        </details>
      </div>

      {/* 4. Test */}
      <div className="flex flex-wrap items-center gap-3 border-t border-adm-line pt-4">
        <button
          type="button"
          className="admin-btn admin-btn-navy"
          disabled={pending || !hasToken || activeChats === 0}
          onClick={() => run(() => sendLineTestAction(locale), () => l.testSent)}
        >
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
          {l.test}
        </button>
        <p className="admin-hint">{l.testHint}</p>
      </div>

      {/* 5. What happened to the last alerts */}
      <div>
        <h4 className="admin-section-title">{l.deliveries}</h4>
        {props.deliveries.length === 0 ? (
          <p className="admin-hint mt-1">{l.deliveriesEmpty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-adm-line rounded-xs border border-adm-line text-sm">
            {props.deliveries.map((d, i) => {
              const reason = l[`reason.${d.detail}` as keyof LineCardLabels];
              return (
                <li key={`${d.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5">
                  <span className="w-36 shrink-0 text-xs text-adm-muted">
                    {new Date(d.at).toLocaleString(props.locale_tag, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="w-28 shrink-0 text-adm-text">
                    {d.kind === "lead" ? l.kindLead : d.kind === "registration" ? l.kindRegistration : l.kindTest}
                  </span>
                  <span
                    className={`shrink-0 font-medium ${
                      d.outcome === "sent"
                        ? "text-adm-success"
                        : d.outcome === "failed"
                          ? "text-adm-danger"
                          : "text-adm-warning"
                    }`}
                  >
                    {d.outcome === "sent" ? l.outcomeSent : d.outcome === "failed" ? l.outcomeFailed : l.outcomeSkipped}
                  </span>
                  {d.outcome !== "sent" && (
                    <span className="min-w-0 flex-1 break-words text-xs text-adm-muted">{reason ?? d.detail}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="rounded-xs border border-adm-line bg-adm-text/4 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-adm-text">{l.steps}</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-adm-muted">
          <li>{l.step1}</li>
          <li>{l.step2}</li>
          <li>{l.step3}</li>
          <li>{l.step4}</li>
          <li>{l.step5}</li>
        </ol>
        <p className="admin-hint mt-2">{l.quotaNote}</p>
      </details>
    </section>
  );
}
