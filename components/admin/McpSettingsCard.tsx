"use client";

/**
 * components/admin/McpSettingsCard.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The AI connection on /admin/settings/integrations: the address a client
 * connects to, the keys it may use, and the deletions waiting for a person.
 *
 * A new key is shown once, in this card, straight from the action's answer.
 * It is never in the page's HTML and is gone on the next render — the
 * server only keeps its hash (lib/mcp/tokens.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Loader2, ShieldAlert } from "lucide-react";
import type { McpActionResult } from "@/app/[locale]/admin/(system)/settings/integrations/mcp-actions";

export type McpCardLabels = Record<string, string>;

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  userName: string;
  state: "active" | "revoked" | "expired";
  lastUsed: string | null;
  expires: string | null;
};

type ApprovalRow = { id: string; summary: string; count: number; requested: string };

type GrantRow = { id: string; clientName: string; botName: string; scope: string; connected: string; lastUsed: string | null };

type Props = {
  endpoint: string;
  bots: { id: string; name: string }[];
  tokens: TokenRow[];
  approvals: ApprovalRow[];
  grants: GrantRow[];
  labels: McpCardLabels;
  create: (input: { name: string; userId: string; scope: "read" | "write"; expiresDays: number }) => Promise<McpActionResult>;
  revoke: (id: string) => Promise<McpActionResult>;
  approve: (id: string) => Promise<McpActionResult>;
  reject: (id: string) => Promise<McpActionResult>;
  disconnect: (id: string) => Promise<McpActionResult>;
  setScope: (id: string, scope: "read" | "write") => Promise<McpActionResult>;
};

export default function McpSettingsCard({ endpoint, bots, tokens, approvals, grants, labels: l, create, revoke, approve, reject, disconnect, setScope: changeScope }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [userId, setUserId] = useState(bots[0]?.id ?? "");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [expiresDays, setExpiresDays] = useState(90);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  function run(task: () => Promise<McpActionResult>, done?: (result: McpActionResult & { ok: true }) => void) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        done?.(result);
        router.refresh();
      } else {
        setError(`${l[`err.${result.error}`] ?? result.error}${result.detail ? ` — ${result.detail}` : ""}`);
      }
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The value is on screen and can be selected by hand. */
    }
  }

  const stateLabel = { active: l.stateActive, revoked: l.stateRevoked, expired: l.stateExpired };

  return (
    <section className="admin-card space-y-5" data-testid="mcp-card">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adm-text">
          <Bot size={15} className="text-adm-accent-ink" aria-hidden />
          {l.title}
        </h3>
        <p className="admin-hint mt-1 max-w-2xl">{l.subtitle}</p>
      </div>

      <div>
        <span className="admin-label">{l.endpoint}</span>
        <div className="mt-1 flex items-center gap-2">
          <code className="admin-input flex-1 truncate font-mono text-xs">{endpoint}</code>
          <button type="button" className="admin-btn-ghost" onClick={() => copy(endpoint)} aria-label={l.copy}>
            <Copy size={14} aria-hidden />
          </button>
        </div>
        <p className="admin-hint mt-1">{l.connectorHint}</p>
      </div>

      <div data-testid="mcp-connections">
        <h4 className="admin-label">{l.connectionsTitle}</h4>
        {grants.length === 0 ? (
          <p className="admin-hint mt-1">{l.connectionsEmpty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-adm-line rounded-xs border border-adm-line">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium text-adm-text">{grant.clientName}</span>
                <span className="text-xs text-adm-muted">
                  {l.connectedAs} {grant.botName}
                </span>
                <select
                  aria-label={`${l.keyScope}: ${grant.clientName}`}
                  disabled={pending}
                  value={grant.scope === "write" ? "write" : "read"}
                  onChange={(event) => run(() => changeScope(grant.id, event.target.value as "read" | "write"))}
                  className="admin-input w-auto py-1 text-xs"
                >
                  <option value="read">{l.scopeRead}</option>
                  <option value="write">{l.scopeWrite}</option>
                </select>
                <span className="text-xs text-adm-muted">
                  {l.connectedOn} {grant.connected}
                  {grant.lastUsed ? ` · ${l.lastUsed} ${grant.lastUsed}` : ""}
                </span>
                <button type="button" disabled={pending} className="admin-btn-ghost ml-auto text-adm-danger!" onClick={() => run(() => disconnect(grant.id))}>
                  {l.endConnection}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {approvals.length > 0 && (
        <div className="space-y-2 rounded-xs border border-adm-warning/30 bg-adm-warning-bg p-3" data-testid="mcp-approvals">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-adm-warning">
            <ShieldAlert size={15} aria-hidden />
            {l.approvalsTitle}
          </h4>
          <p className="text-xs text-adm-warning">{l.approvalsHint}</p>
          <ul className="space-y-2">
            {approvals.map((row) => (
              <li key={row.id} className="rounded-xs border border-adm-line bg-adm-surface p-3">
                <p className="text-sm whitespace-pre-wrap text-adm-text">{row.summary}</p>
                <p className="admin-hint mt-1">
                  {l.approvalsCount.replace("{count}", String(row.count))} · {row.requested}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {confirming === row.id ? (
                    <>
                      <span className="text-xs font-medium text-adm-danger">{l.approveConfirm}</span>
                      <button
                        type="button"
                        disabled={pending}
                        className="admin-btn bg-adm-danger!"
                        onClick={() => run(() => approve(row.id), () => setConfirming(null))}
                      >
                        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                        {l.approveYes}
                      </button>
                      <button type="button" disabled={pending} className="admin-btn-ghost" onClick={() => setConfirming(null)}>
                        {l.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={pending} className="admin-btn" onClick={() => setConfirming(row.id)}>
                        {l.approve}
                      </button>
                      <button type="button" disabled={pending} className="admin-btn-ghost" onClick={() => run(() => reject(row.id))}>
                        {l.reject}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="admin-label">{l.keysTitle}</h4>
        {tokens.length === 0 ? (
          <p className="admin-hint mt-1">{l.keysEmpty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-adm-line rounded-xs border border-adm-line">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium text-adm-text">{token.name}</span>
                <code className="font-mono text-xs text-adm-muted">{token.prefix}…</code>
                <span className="text-xs text-adm-muted">{token.userName}</span>
                <span className="text-xs text-adm-muted">{token.scope === "write" ? l.scopeWrite : l.scopeRead}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    token.state === "active" ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-muted"
                  }`}
                >
                  {stateLabel[token.state]}
                </span>
                <span className="text-xs text-adm-muted">
                  {token.lastUsed ? `${l.lastUsed} ${token.lastUsed}` : l.neverUsed}
                  {token.expires ? ` · ${l.expires} ${token.expires}` : ""}
                </span>
                {token.state === "active" && (
                  <button
                    type="button"
                    disabled={pending}
                    className="admin-btn-ghost ml-auto text-adm-danger!"
                    onClick={() => run(() => revoke(token.id))}
                  >
                    {l.revoke}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {fresh && (
        <div className="space-y-2 rounded-xs border border-adm-success/30 bg-adm-success-bg p-3" data-testid="mcp-new-key">
          <p className="text-sm font-medium text-adm-success">{l.newKeyTitle}</p>
          <div className="flex items-center gap-2">
            <code className="admin-input flex-1 font-mono text-xs break-all" data-testid="mcp-new-key-value">
              {fresh}
            </code>
            <button type="button" className="admin-btn-ghost" onClick={() => copy(fresh)} aria-label={l.copy}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
          </div>
          <p className="text-xs text-adm-success">{l.newKeyHint}</p>
        </div>
      )}

      {bots.length === 0 ? (
        <p className="rounded-xs border border-adm-line bg-adm-text/4 px-3 py-2 text-xs text-adm-muted">{l.noBots}</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => create({ name, userId, scope, expiresDays }),
              (result) => {
                setFresh(result.token ?? null);
                setName("");
              },
            );
          }}
        >
          <label className="block">
            <span className="admin-label">{l.keyName}</span>
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={l.keyNamePlaceholder}
              className="admin-input mt-1"
            />
          </label>
          <label className="block">
            <span className="admin-label">{l.keyAccount}</span>
            <select value={userId} onChange={(event) => setUserId(event.target.value)} className="admin-input mt-1">
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="admin-label">{l.keyScope}</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as "read" | "write")} className="admin-input mt-1">
              <option value="read">{l.scopeRead}</option>
              <option value="write">{l.scopeWrite}</option>
            </select>
            <span className="admin-hint mt-1 block">{l.keyScopeHint}</span>
          </label>
          <label className="block">
            <span className="admin-label">{l.keyExpires}</span>
            <select value={expiresDays} onChange={(event) => setExpiresDays(Number(event.target.value))} className="admin-input mt-1">
              <option value={30}>{l.days30}</option>
              <option value={90}>{l.days90}</option>
              <option value={365}>{l.days365}</option>
              <option value={0}>{l.daysNever}</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={pending} className="admin-btn">
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              {l.createKey}
            </button>
            {error && <span className="text-xs text-adm-danger">{error}</span>}
          </div>
        </form>
      )}
      {bots.length === 0 && error && <span className="text-xs text-adm-danger">{error}</span>}
    </section>
  );
}
