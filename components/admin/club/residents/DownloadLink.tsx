"use client";

/**
 * A plain file download (QR PNG/SVG, the project ZIP). The route handler
 * marks NONE cards as PRINTED, so the page is refreshed shortly after to
 * show the new card status.
 */

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function DownloadLink({ href, className, title, children }: { href: string; className: string; title?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <a href={href} download className={className} title={title} onClick={() => window.setTimeout(() => router.refresh(), 2500)}>
      {children}
    </a>
  );
}
