/**
 * components/unit-types/model3d/key.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A unit type's code as the 3D models know it: "Type A+" → "A+".
 *
 * The models are keyed by the bare letter ("A", "A+", "R"), and so was the
 * development database. Production's codes carry the word, "Type A", which
 * the site shows as typed. Matched as-is, no type had a model on the live
 * site and the 3D view never appeared, although every test and the local
 * admin showed it. Everything that looks a model up by code goes through
 * this.
 *
 * Its own module so the client components can import it without pulling in
 * the loaders in index.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function model3dKey(code: string | null | undefined): string {
  return (code ?? "").trim().replace(/^type\s+/i, "").toUpperCase();
}

/**
 * Codes that name the same house differently on different databases.
 * Trinity Village's 4-bed, 560 m² house is "V" in the model file and in the
 * development seed, and "Type B" on production. The model itself is titled
 * "Type B". Keyed by the normalised code, pointing at the model's key.
 */
const MODEL_3D_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "trinity-village": { B: "V" },
};

/** The model key for a project's unit-type code, aliases applied. */
export function model3dKeyFor(projectSlug: string, code: string | null | undefined): string {
  const key = model3dKey(code);
  return MODEL_3D_ALIASES[projectSlug]?.[key] ?? key;
}
