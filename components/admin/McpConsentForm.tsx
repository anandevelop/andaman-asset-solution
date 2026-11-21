"use client";

/**
 * The consent screen's form: which Bot account the application will act as,
 * with what access, and yes or no. On either answer the browser is sent
 * back to the application's own redirect address, which the server has
 * already checked against what the application registered.
 */

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import type { ConsentResult } from "@/app/[locale]/admin/(system)/settings/integrations/mcp-actions";

type Props = {
  requestId: string;
  askedScope: "read" | "write";
  bots: { id: string; name: string }[];
  labels: Record<string, string>;
  approve: (input: { requestId: string; botUserId: string; scope: "read" | "write" }) => Promise<ConsentResult>;
  deny: (requestId: string) => Promise<ConsentResult>;
};

export default function McpConsentForm({ requestId, askedScope, bots, labels: l, approve, deny }: Props) {
  const [pending, startTransition] = useTransition();
  const [botUserId, setBotUserId] = useState(bots[0]?.id ?? "");
  // What the application asked for, as the starting point; the
  // administrator's choice is what is granted.
  const [scope, setScope] = useState<"read" | "write">(askedScope);
  const [error, setError] = useState<string | null>(null);

  function answer(task: () => Promise<ConsentResult>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) window.location.assign(result.redirectTo);
      else setError(l[`err.${result.error}`] ?? result.error);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        answer(() => approve({ requestId, botUserId, scope }));
      }}
    >
      <label className="block">
        <span className="admin-label">{l.keyAccount}</span>
        <select value={botUserId} onChange={(event) => setBotUserId(event.target.value)} className="admin-input mt-1">
          {bots.map((bot) => (
            <option key={bot.id} value={bot.id}>
              {bot.name}
            </option>
          ))}
        </select>
        <span className="admin-hint mt-1 block">{l.consentAccountHint}</span>
      </label>

      <label className="block">
        <span className="admin-label">{l.keyScope}</span>
        <select value={scope} onChange={(event) => setScope(event.target.value as "read" | "write")} className="admin-input mt-1">
          <option value="read">{l.scopeRead}</option>
          <option value="write">{l.scopeWrite}</option>
        </select>
        <span className="admin-hint mt-1 block">{l.consentScopeHint}</span>
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" disabled={pending || !botUserId} className="admin-btn">
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />}
          {l.consentAllow}
        </button>
        <button type="button" disabled={pending} className="admin-btn-ghost" onClick={() => answer(() => deny(requestId))}>
          {l.consentDeny}
        </button>
        {error && <span className="text-xs text-adm-danger">{error}</span>}
      </div>
    </form>
  );
}
