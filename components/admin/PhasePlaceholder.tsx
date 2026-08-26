/**
 * components/admin/PhasePlaceholder.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Honest stub for sidebar destinations that are scaffolded but not built.
 * A link that 404s reads as a bug; a link that says "later phase" reads as
 * a plan.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Construction } from "lucide-react";

type Props = { section: string; title: string; body: string };

export default function PhasePlaceholder({ section, title, body }: Props) {
  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{section}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{title}</h1>
      </header>

      <div className="admin-card flex flex-col items-center gap-3 py-14 text-center">
        <Construction size={28} strokeWidth={1.5} className="text-accent-700" aria-hidden />
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  );
}
