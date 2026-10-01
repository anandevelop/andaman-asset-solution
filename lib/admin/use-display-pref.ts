"use client";

/**
 * lib/admin/use-display-pref.ts — the client half of display-prefs.ts:
 * apply a choice, restore the stored ones, and subscribe a toggle to them.
 */

import { useSyncExternalStore } from "react";
import { DISPLAY_PREFS, type DisplayPref, type DisplayValue } from "@/lib/admin/display-prefs";

const CHANGE_EVENT = "admin:display-pref";

/** The first value is the default and is represented by *no* attribute,
 *  so the CSS needs no rule for it and a cleared store means "default". */
export function applyDisplayPref<K extends DisplayPref>(kind: K, value: DisplayValue<K>, persist = true) {
  const pref = DISPLAY_PREFS[kind];
  const root = document.documentElement;
  if (value === pref.values[0]) delete root.dataset[pref.dataKey];
  else root.dataset[pref.dataKey] = value;

  if (persist) {
    try {
      window.localStorage.setItem(pref.storageKey, value);
    } catch {
      /* private mode or blocked storage — the choice still holds for this page view */
    }
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Re-apply whatever is stored. The root layout's inline script already did
 *  on the first full load; this catches a choice changed in another tab
 *  since, before the next client-side navigation into the back office. */
export function restoreDisplayPrefs() {
  for (const kind of Object.keys(DISPLAY_PREFS) as DisplayPref[]) {
    const pref = DISPLAY_PREFS[kind];
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(pref.storageKey);
    } catch {
      /* nothing stored is the same as the default */
    }
    const value = (pref.values as readonly string[]).includes(stored ?? "") ? stored : pref.values[0];
    applyDisplayPref(kind, value as DisplayValue<typeof kind>, false);
  }
}

/** Flip the sidebar between wide and narrow — the topbar's button and the
 *  rail's `[` key. Reads the attribute, not a React copy, so two callers
 *  can never toggle from different ideas of the current state. */
export function toggleRail() {
  const collapsed = document.documentElement.dataset[DISPLAY_PREFS.rail.dataKey] === "collapsed";
  applyDisplayPref("rail", collapsed ? "expanded" : "collapsed");
}

/** Open or close the Copilot panel — its topbar button and the `.` key. */
export function toggleCopilot() {
  const open = document.documentElement.dataset[DISPLAY_PREFS.copilot.dataKey] === "open";
  applyDisplayPref("copilot", open ? "closed" : "open");
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function useDisplayPref<K extends DisplayPref>(kind: K): DisplayValue<K> {
  const pref = DISPLAY_PREFS[kind];
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset[pref.dataKey] ?? pref.values[0]) as DisplayValue<K>,
    () => pref.values[0] as DisplayValue<K>,
  );
}

