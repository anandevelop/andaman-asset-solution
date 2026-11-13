"use client";

/**
 * components/admin/agents/PendingAgents.tsx — self-registrations waiting
 * for approval, as a card of their own above the list. They used to be a
 * banner, a filter chip and tinted table rows; the two buttons were three
 * steps away from the sentence saying somebody was waiting.
 */

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Clock } from "lucide-react";
import { approveAgent, rejectAgent } from "@/app/[locale]/admin/(crm)/agents/actions";
import { useFlash } from "@/components/admin/agents/Flash";
import { initialsOf } from "@/components/admin/agents/ui";

export type PendingAgent = { id: string; name: string; meta: string; editHref: string };

export default function PendingAgents({ locale, agents }: { locale: string; agents: PendingAgent[] }) {
  const t = useTranslations("coAgents.agents");
  const router = useRouter();
  const [flash, show] = useFlash();
  const [busy, startTransition] = useTransition();

  const act = (task: () => Promise<{ ok: boolean }>, done: string) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        show(t("errGeneric"), "error");
        return;
      }
      show(done);
      router.refresh();
    });

  return (
    <section aria-labelledby="pending-agents-title" className="mb-5 space-y-3 rounded-2xl bg-adm-warning-bg px-4 py-4 sm:px-[22px]">
      {flash}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-adm-warning">
        <Clock size={16} aria-hidden />
        <h2 id="pending-agents-title" className="text-sm font-semibold">
          {t("pendingTitle", { count: agents.length })}
        </h2>
        <span className="text-[13px]">{t("pendingSub")}</span>
      </div>
      <ul className="grid gap-2.5 lg:grid-cols-2">
        {agents.map((agent) => (
          <li key={agent.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-adm-solid px-3.5 py-3">
            <span aria-hidden className="grid size-[38px] shrink-0 place-items-center rounded-full bg-adm-neutral-bg text-[13px] font-semibold text-adm-neutral">
              {initialsOf(agent.name)}
            </span>
            <div className="min-w-0 flex-[1_1_10rem]">
              <Link href={agent.editHref} scroll={false} className="block truncate font-semibold text-adm-text hover:underline">
                {agent.name}
              </Link>
              <p className="truncate text-[12.5px] text-adm-muted">{agent.meta}</p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="admin-btn max-sm:min-h-11"
                disabled={busy}
                onClick={() => act(() => approveAgent(locale, agent.id), t("approvedToast", { name: agent.name }))}
              >
                <Check size={14} aria-hidden /> {t("approve")}
              </button>
              <button
                type="button"
                className="admin-btn-danger max-sm:min-h-11"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t("rejectConfirm", { name: agent.name }))) act(() => rejectAgent(locale, agent.id), t("rejectedToast"));
                }}
              >
                {t("reject")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
