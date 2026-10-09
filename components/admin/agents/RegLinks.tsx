"use client";

/**
 * components/admin/agents/RegLinks.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The registration-links drawer (the mockup's regLinkDrawer): one link per
 * active sales person (/<locale>/agent/register?ref=<refSlug>) with copy /
 * WhatsApp / LINE / email sharing and an on-off switch (ADMIN+), plus the
 * generic website link.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Globe, Mail, Send, ShieldCheck } from "lucide-react";
import { setAgentLink } from "@/app/[locale]/admin/(crm)/agents/actions";
import { useFlash } from "@/components/admin/agents/Flash";
import { Note, Switch } from "@/components/admin/agents/ui";

export type RegLink = {
  key: string;
  salesPersonId: string | null;
  title: string;
  subtitle: string | null;
  url: string;
  enabled: boolean;
  registered: number;
};

export default function RegLinks({
  locale,
  sales,
  website,
  canToggle,
}: {
  locale: string;
  sales: RegLink[];
  website: RegLink;
  canToggle: boolean;
}) {
  const t = useTranslations("coAgents.agents");
  const router = useRouter();
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();

  const toggle = (link: RegLink) =>
    link.salesPersonId &&
    startTransition(async () => {
      const result = await setAgentLink(locale, link.salesPersonId as string, !link.enabled);
      if (!result.ok) {
        show(t("errGeneric"), "error");
        return;
      }
      show(link.enabled ? t("linksDisabled", { name: link.title }) : t("linksEnabled", { name: link.title }));
      router.refresh();
    });

  const card = (link: RegLink, withSwitch: boolean) => (
    <div key={link.key} className={`mb-2.5 rounded-xl border border-adm-line p-3 ${link.enabled ? "" : "opacity-70"}`}>
      <div className="mb-2 flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-medium text-adm-text">{link.title}</b>
          <small className="text-[11.5px] text-adm-muted">
            {link.subtitle ? `${link.subtitle} · ` : ""}
            {t("linksRegistered", { count: link.registered })}
          </small>
        </div>
        {withSwitch && (
          <Switch
            checked={link.enabled}
            label={t("linksEnable", { name: link.title })}
            title={canToggle ? undefined : t("linksAdminOnly")}
            disabled={!canToggle || busy}
            onClick={() => toggle(link)}
          />
        )}
      </div>
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-adm-text/5 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-adm-text">{link.url.replace(/^https?:\/\//, "")}</span>
        <button
          type="button"
          className="admin-btn-ghost admin-btn-sm"
          disabled={!link.enabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link.url);
              show(t("linksCopied"));
            } catch {
              /* clipboard blocked — the URL is visible */
            }
          }}
        >
          <Copy size={13} aria-hidden /> {t("linksCopy")}
        </button>
      </div>
      {link.enabled ? (
        <div className="flex flex-wrap gap-1.5">
          <a
            className="admin-btn-ghost admin-btn-sm"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(t("shareText", { url: link.url }))}`}
          >
            <Send size={13} aria-hidden /> {t("linksWhatsapp")}
          </a>
          <a
            className="admin-btn-ghost admin-btn-sm"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://line.me/R/msg/text/?${encodeURIComponent(t("shareText", { url: link.url }))}`}
          >
            <Send size={13} aria-hidden /> {t("linksLine")}
          </a>
          <a
            className="admin-btn-ghost admin-btn-sm"
            href={`mailto:?subject=${encodeURIComponent(t("shareSubject"))}&body=${encodeURIComponent(t("shareText", { url: link.url }))}`}
          >
            <Mail size={13} aria-hidden /> {t("linksEmail")}
          </a>
          <a className="admin-btn-quiet admin-btn-sm ml-auto" target="_blank" rel="noopener noreferrer" href={link.url}>
            <Globe size={13} aria-hidden /> {t("linksPreview")}
          </a>
        </div>
      ) : (
        <small className="text-xs text-adm-muted">{t("linksOff")}</small>
      )}
    </div>
  );

  return (
    <div>
      {flash}
      <div className="mb-4">
        <Note icon={<ShieldCheck size={15} />}>{t("linksNote")}</Note>
      </div>
      <h5 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted">{t("linksSales", { count: sales.length })}</h5>
      {sales.length ? sales.map((link) => card(link, true)) : <p className="mb-3 text-sm text-adm-muted">{t("linksNoSales")}</p>}
      <h5 className="mb-2.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-adm-muted">{t("linksGeneral")}</h5>
      {card(website, false)}
    </div>
  );
}
