"use client";

/**
 * components/admin/PublishingRowActions.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The workflow-stage buttons on one Publishing dashboard row — which
 * button(s) show depends only on contentStatus, matching the state
 * machine in app/[locale]/admin/publishing/actions.ts exactly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ContentStatus } from "@prisma/client";
import {
  approveAndPublish,
  sendBackToDraft,
  startDraft,
  submitForReview,
} from "@/app/[locale]/admin/(content)/publishing/actions";

type Labels = {
  startDraft: string;
  submit: string;
  approve: string;
  reject: string;
  error: string;
};

type Props = {
  locale: string;
  type: string;
  id: string;
  contentStatus: ContentStatus;
  canReview: boolean;
  labels: Labels;
};

export default function PublishingRowActions({ locale, type, id, contentStatus, canReview, labels }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
    });
  }

  const btn = "min-h-[32px] rounded-xs px-2.5 text-xs font-medium disabled:opacity-60";
  const btnPrimary = `${btn} bg-primary text-white`;
  const btnGhost = `${btn} border border-primary/20 text-primary`;
  const btnDanger = `${btn} border border-red-300 text-red-700`;

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 size={14} className="animate-spin text-ink-muted" aria-hidden />}

      {contentStatus === ContentStatus.PUBLISHED && (
        <button type="button" disabled={pending} onClick={() => run(() => startDraft(locale, type, id))} className={btnGhost}>
          {labels.startDraft}
        </button>
      )}

      {contentStatus === ContentStatus.DRAFT && (
        <button type="button" disabled={pending} onClick={() => run(() => submitForReview(locale, type, id))} className={btnPrimary}>
          {labels.submit}
        </button>
      )}

      {contentStatus === ContentStatus.IN_REVIEW && canReview && (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => sendBackToDraft(locale, type, id))} className={btnDanger}>
            {labels.reject}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => approveAndPublish(locale, type, id))} className={btnPrimary}>
            {labels.approve}
          </button>
        </>
      )}
    </div>
  );
}
