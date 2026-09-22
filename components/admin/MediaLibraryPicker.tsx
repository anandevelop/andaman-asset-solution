"use client";

/**
 * components/admin/MediaLibraryPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The library-browsing step shared by every "pick an existing file" flow —
 * InsertImageModal's own first step, and ImageUploader's "choose from
 * library" button. Fetches the library on open (a client component has no
 * server-rendered page props to read it from) and renders MediaLibrary in
 * its picker mode; no modal chrome of its own, so each caller wraps this in
 * whatever shell fits its own flow.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import MediaLibrary, { type MediaItem } from "@/components/admin/MediaLibrary";
import { fetchMediaLibrary } from "@/app/[locale]/admin/(content)/media/actions";
import type { Locale } from "@/i18n";

type Props = {
  /** Re-fetches every time this turns true, mirroring how a caller-owned
   *  modal reopens on a stale list otherwise. */
  open: boolean;
  locale: Locale;
  loadingLabel: string;
  onSelect: (item: MediaItem) => void;
};

export default function MediaLibraryPicker({ open, locale, loadingLabel, onSelect }: Props) {
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof fetchMediaLibrary>> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchMediaLibrary()
      .then(setLibrary)
      .finally(() => setLoading(false));
  }, [open]);

  if (loading || !library) {
    return <p className="py-10 text-center text-sm text-ink-muted">{loadingLabel}</p>;
  }

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <MediaLibrary
        locale={locale}
        initialItems={library.items}
        tagCounts={library.tagCounts}
        missingAltCount={library.missingAltCount}
        unusedCount={library.unusedCount}
        legacyHostCount={library.legacyHostCount}
        truncated={library.truncated}
        onSelect={onSelect}
      />
    </div>
  );
}

export type { MediaItem };
