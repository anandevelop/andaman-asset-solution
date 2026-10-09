"use client";

/**
 * components/edit/EditModeProvider.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Decides, after hydration, whether this visitor is an editor — and if so
 * draws the admin bar and lets every <EditableSection> show its pill.
 *
 * See lib/edit-mode.ts for why this cannot be decided on the server. The
 * short version: the page HTML is cached and shared by every visitor, so
 * it must be identical for all of them, and the difference is applied in
 * the browser.
 *
 * ONE SESSION REQUEST PER FULL PAGE LOAD
 *
 * This provider lives in the (site) layout, which persists across client
 * navigations, so the fetch runs once when the site is opened, not once
 * per page. For an anonymous visitor /api/auth/session is a cookie check
 * that answers `{}` without touching the database (the jwt callback only
 * re-validates a token that exists).
 *
 * The on/off switch is kept in localStorage: it is one editor's preference
 * in one browser, and losing it (private window, cleared storage) costs
 * nothing but the default, which is "on".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import { adminBaseFor, canSeeEditMode, type EditLink } from "@/lib/edit-mode";
import EditBar from "./EditBar";
import CopyPicker from "./CopyPicker";

const STORAGE_KEY = "andaman.editMode";

type EditModeState = {
  /** Signed in with a role that may edit content. */
  canEdit: boolean;
  /** canEdit and the switch is on — what the pills check. */
  editing: boolean;
  setEditing: (value: boolean) => void;
  role: Role | null;
  /** `/{th|en}/admin`. */
  adminBase: string;
  /** Set by <EditTarget> on detail pages; overrides the path table. */
  pageTarget: EditLink | null;
  setPageTarget: (target: EditLink | null) => void;
  /** "Edit text" mode: the next click on the page picks the words under it
   *  (components/edit/CopyPicker.tsx). Not remembered across page loads. */
  picking: boolean;
  setPicking: (value: boolean) => void;
  /** The picker registers "may I close?" here (it asks when the panel has
   *  unsaved text), so turning the mode off from the bar asks too. */
  setPickGuard: (guard: (() => boolean) | null) => void;
};

const EditModeContext = createContext<EditModeState | null>(null);

/** Outside the provider (or before it decides) nothing is editable. */
export function useEditMode(): EditModeState | null {
  return useContext(EditModeContext);
}

function readSwitch(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export default function EditModeProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [switchOn, setSwitchOn] = useState(true);
  const [pageTarget, setPageTarget] = useState<EditLink | null>(null);
  const [picking, setPicking] = useState(false);
  // State rather than a ref: it is read while building the context value.
  const [pickGuard, setPickGuardState] = useState<(() => boolean) | null>(null);

  const setPickingGuarded = useCallback(
    (value: boolean) => {
      if (!value && pickGuard && !pickGuard()) return;
      setPicking(value);
    },
    [pickGuard],
  );

  const setPickGuard = useCallback((guard: (() => boolean) | null) => {
    // The updater form: a bare function would be called as one.
    setPickGuardState(() => guard);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { user?: { role?: Role; twoFactorPending?: boolean } } | null) => {
        if (cancelled) return;
        const user = session?.user;
        // An account still owing 2FA setup can reach nothing in /admin but
        // the setup screen (proxy.ts); every pill would land there.
        if (user?.role && !user.twoFactorPending && canSeeEditMode(user.role)) {
          // Read alongside the role rather than on mount: nothing renders
          // the switch until there is a role, and it saves a render.
          setSwitchOn(readSwitch());
          setRole(user.role);
        }
      })
      .catch(() => {
        // A failed check is the anonymous case: show nothing.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setEditing = useCallback((value: boolean) => {
    setSwitchOn(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      // Storage refused — the switch still works for this page view.
    }
  }, []);

  const value = useMemo<EditModeState>(
    () => ({
      canEdit: role !== null,
      editing: role !== null && switchOn,
      setEditing,
      role,
      adminBase: adminBaseFor(locale),
      pageTarget,
      setPageTarget,
      picking: role !== null && picking,
      setPicking: setPickingGuarded,
      setPickGuard,
    }),
    [role, switchOn, setEditing, locale, pageTarget, picking, setPickingGuarded, setPickGuard],
  );

  return (
    <EditModeContext.Provider value={value}>
      {value.canEdit && <EditBar />}
      {value.canEdit && <CopyPicker locale={locale} />}
      {children}
    </EditModeContext.Provider>
  );
}
