# 3D site plan — how it works and how to add a scene

Committed in 5d7f290 (Oct 2026).

## Pieces
- Scenes: `public/embed/<slug>-3d.html` (hand-modelled three.js r128). Current: residence-prime, trinity-village, victory.
- three.js: self-hosted in `public/embed/vendor/three-r128/` (three.min.js, OrbitControls, BufferGeometryUtils, GLTFLoader), cached immutable.
- Registry: `lib/site-plan-3d.ts` (slug → scene path). A listed project gets the 3D tab (first/default view) in the site plan.
- Frame: `components/SitePlan3D.tsx` — iframe, `loading="lazy"`, sends `rp3d:setUnits` (live statuses), listens for `rp3d:enquire` (fills the enquiry form) / `rp3d:select`.
- Admin: units tab → `SitePlan3dCard` (plot check vs DB via `lib/site-plan-3d-check.ts`, show/hide switch = `Project.sitePlan3dEnabled`, preview).

## Adding or updating a scene
1. `node scripts/prepare-3d-scene.mjs --from <new.html> public/embed/<slug>-3d.html`
   - rewrites CDN URLs to /embed/vendor, adds the off-screen render pause, caps pixel ratio on phones, removes common-area labels and the patrol car, narrows `?data=` to same origin. Warns if anything was not recognised.
2. New project: add the slug to `lib/site-plan-3d.ts`.
3. Check the admin units tab: the 3D card should read "N / N ตรงกับระบบ". Plot labels match DB unit numbers ignoring case, leading zeros and "+".

## Sizes (gzip)
three.js + addons ≈ 160–180 KB (cached once); scenes: RP ≈ 140 KB, Trinity ≈ 175 KB, Victory ≈ 550 KB (embedded GLB models + textures — the candidate for texture compression).
