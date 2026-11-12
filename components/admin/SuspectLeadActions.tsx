"use client";

/**
 * The three buttons on a held enquiry (/admin/leads/suspect). Spam asks
 * once more, since it also blocks the sender.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSuspectLead,
  markSuspectLeadSpam,
  releaseSuspectLead,
} from "@/app/[locale]/admin/(crm)/leads/suspect/actions";

type Labels = { release: string; spam: string; confirmSpam: string; remove: string; failed: string; cancel: string };

export default function SuspectLeadActions({ locale, id, labels }: { locale: string; id: string; labels: Labels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = (action: typeof releaseSuspectLead) =>
    startTransition(async () => {
      setFailed(false);
      const result = await action(locale, id);
      if (!result.ok) setFailed(true);
      else if (result.leadId) router.push(`/${locale}/admin/leads/${result.leadId}`);
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {confirming ? (
        <>
          <button type="button" disabled={pending} onClick={() => run(markSuspectLeadSpam)} className="admin-btn-danger admin-btn-sm">
            {labels.confirmSpam}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="admin-btn-quiet admin-btn-sm">
            {labels.cancel}
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => run(releaseSuspectLead)} className="admin-btn admin-btn-sm">
            {labels.release}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="admin-btn-ghost admin-btn-sm">
            {labels.spam}
          </button>
          <button type="button" disabled={pending} onClick={() => run(deleteSuspectLead)} className="admin-btn-quiet admin-btn-sm">
            {labels.remove}
          </button>
        </>
      )}
      {failed && <span className="text-xs text-adm-danger">{labels.failed}</span>}
    </div>
  );
}
