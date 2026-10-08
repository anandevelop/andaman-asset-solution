"use client";

/**
 * components/edit/EditTarget.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tells the admin bar what "Edit this page" means on a page whose editor
 * needs a database id — one project, one article. Renders nothing.
 *
 * Cleared on unmount, so a client navigation from a project to the
 * projects list does not leave the bar pointing at the project.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { useEditMode } from "./EditModeProvider";

export default function EditTarget({ labelKey, href }: { labelKey: string; href: string }) {
  const setPageTarget = useEditMode()?.setPageTarget;

  useEffect(() => {
    if (!setPageTarget) return;
    setPageTarget({ labelKey, href });
    return () => setPageTarget(null);
  }, [setPageTarget, labelKey, href]);

  return null;
}
