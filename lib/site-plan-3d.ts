/**
 * lib/site-plan-3d.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Projects whose site plan has a 3D scene, by slug → the scene's file in
 * public/embed/. A project listed here gets a "3D" view beside the map and
 * the unit list (components/SitePlanMap.tsx); every other project is
 * unchanged.
 *
 * Each scene is modelled for its own project, with the plot numbers built
 * in, so a scene must only ever be listed against the project it was made
 * for. Statuses are not taken from the file: SitePlan3D sends the live
 * ones in.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const SITE_PLAN_3D: Readonly<Record<string, string>> = {
  "residence-prime": "/embed/residence-prime-3d.html",
  "trinity-village": "/embed/trinity-village-3d.html",
  victory: "/embed/victory-3d.html",
};

export function sitePlan3dSrc(projectSlug: string): string | null {
  return SITE_PLAN_3D[projectSlug] ?? null;
}
