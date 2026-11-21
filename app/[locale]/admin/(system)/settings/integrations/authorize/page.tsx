/**
 * /admin/settings/integrations/authorize — the OAuth consent screen.
 *
 * Reached from /api/oauth/authorize, after the request has been checked
 * and stored. Everything shown comes from that stored row, not from the
 * address bar: the application's name, where the browser will be sent
 * back to, and what it asked for.
 *
 * ADMIN and above, behind the ordinary sign-in — so approving a connection
 * takes a password and a second factor, and a signed-out administrator is
 * sent to sign in and brought back here.
 */

import { Role } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { Bot, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { pendingRequest } from "@/lib/mcp/oauth";
import McpConsentForm from "@/components/admin/McpConsentForm";
import { approveOAuthRequestAction, denyOAuthRequestAction } from "../mcp-actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ request?: string }> };

export const dynamic = "force-dynamic";

export default async function McpAuthorizePage(props: Props) {
  const { locale } = await props.params;
  const { request: requestId } = await props.searchParams;
  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const raw = t.raw("settings.mcp") as Record<string, string> & { err: Record<string, string> };
  const labels: Record<string, string> = {
    ...Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    ...Object.fromEntries(Object.entries(raw.err).map(([k, v]) => [`err.${k}`, v])),
  };

  const [pending, bots] = await Promise.all([
    requestId ? pendingRequest(requestId) : null,
    prisma.user.findMany({ where: { role: Role.BOT, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!pending) {
    return (
      <section className="admin-card max-w-xl space-y-2" data-testid="mcp-consent-expired">
        <h2 className="text-sm font-semibold text-adm-text">{labels.consentExpiredTitle}</h2>
        <p className="admin-hint">{labels.consentExpiredBody}</p>
      </section>
    );
  }

  const returnHost = new URL(pending.redirectUri).host;

  return (
    <section className="admin-card max-w-xl space-y-5" data-testid="mcp-consent">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-adm-text">
          <Bot size={17} className="text-adm-accent-ink" aria-hidden />
          {labels.consentTitle.replace("{app}", pending.clientName)}
        </h2>
        <p className="admin-hint mt-1">{labels.consentBody}</p>
      </div>

      <dl className="space-y-2 rounded-xs border border-adm-line bg-adm-text/4 p-3 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-adm-muted">{labels.consentApp}</dt>
          <dd className="font-medium text-adm-text">{pending.clientName}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-adm-muted">{labels.consentReturn}</dt>
          <dd className="inline-flex items-center gap-1 font-mono text-xs text-adm-text">
            {returnHost}
            <ExternalLink size={11} aria-hidden />
          </dd>
        </div>
      </dl>

      <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-3 py-2 text-xs text-adm-warning">{labels.consentWarning}</p>

      {bots.length === 0 ? (
        <p className="rounded-xs border border-adm-line bg-adm-text/4 px-3 py-2 text-xs text-adm-muted">{labels.noBots}</p>
      ) : (
        <McpConsentForm
          requestId={pending.id}
          askedScope={pending.scope}
          bots={bots}
          labels={labels}
          approve={approveOAuthRequestAction}
          deny={denyOAuthRequestAction}
        />
      )}
    </section>
  );
}
