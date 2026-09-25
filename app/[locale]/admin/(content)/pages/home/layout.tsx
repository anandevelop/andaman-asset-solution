/**
 * app/[locale]/admin/(content)/pages/home/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * No tab strip any more.
 *
 * It drew Sections | Hero Banner | Gallery | Closing CTA — an order list
 * and three editors as peers, which is what made the order list stop being
 * a picture of the page: the banner and the CTA were tabs *beside* the list
 * rather than rows *in* it. ./page.tsx is the whole page in render order
 * now, and the three editors are reached from the row they belong to.
 *
 * The layout stays, rather than folding into the page, because the routes
 * beneath it still exist and share this guard — and because a wrapper that
 * has to come back the moment Home grows a second screen is cheaper kept
 * than re-derived.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";

type Props = { children: ReactNode };

export default function AdminPagesHomeLayout({ children }: Props) {
  return <div className="space-y-6">{children}</div>;
}
