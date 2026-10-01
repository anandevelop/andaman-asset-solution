/**
 * lib/admin/display-prefs.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The back office's per-browser display choices — text density, light/dark
 * and a collapsed sidebar — and the one place that knows how each is
 * stored and shown.
 *
 * Each is a data attribute on <html> (read by globals.css) mirrored to
 * localStorage. The attribute is the source of truth for what is on
 * screen, so the topbar's toggles subscribe to it rather than keeping a
 * React copy that could drift. Per browser, not per account: both are
 * about the screen in front of you, and the same person may want compact
 * and light on a laptop, roomy and dark on the TV in the sales office.
 *
 * Two files: this one holds the table and the boot script and imports
 * nothing, so the server layout can inline DISPLAY_PREFS_BOOT_SCRIPT (a
 * stored choice is applied before first paint); use-display-pref.ts holds
 * the React side for the topbar's toggles.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const DISPLAY_PREFS = {
  density: { storageKey: "admin-density", dataKey: "adminDensity", values: ["compact", "comfortable"] },
  theme: { storageKey: "admin-theme", dataKey: "adminTheme", values: ["light", "dark"] },
  /* The rail's width. It was React state in AdminSidebar, read from
     storage after mount — so a collapsed rail painted wide for a frame on
     every full load, and the topbar's collapse button and the `[` key had
     no way to reach it. As an attribute on <html> the boot script sets it
     before paint and the rail's width is plain CSS (the `rail-collapsed`
     variant in globals.css). */
  rail: { storageKey: "admin-rail", dataKey: "adminRail", values: ["expanded", "collapsed"] },
} as const;

export type DisplayPref = keyof typeof DISPLAY_PREFS;
export type DisplayValue<K extends DisplayPref> = (typeof DISPLAY_PREFS)[K]["values"][number];

/** Inlined before the admin's markup; must stay dependency-free ES5. */
export const DISPLAY_PREFS_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,p=${JSON.stringify(
  Object.values(DISPLAY_PREFS).map((pref) => [pref.storageKey, pref.dataKey, pref.values]),
)};for(var i=0;i<p.length;i++){var v=localStorage.getItem(p[i][0]);if(v&&v!==p[i][2][0]&&p[i][2].indexOf(v)>-1)d.dataset[p[i][1]]=v;}}catch(e){}})();`;
