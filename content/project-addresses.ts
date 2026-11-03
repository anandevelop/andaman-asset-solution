/**
 * content/project-addresses.ts
 *
 * Each development's postal address in parts, for the project page's
 * JSON-LD (lib/project-schema.ts). Project.location is one display line
 * ("Pasak 8, Cherngtalay, Phuket"), which cannot be split reliably, so the
 * structured version lives here, keyed by slug. Sub-district / district
 * level (brief 29) — replace streetAddress with the plot's real number once
 * there is one. A project missing from this table falls back to its
 * location line as streetAddress, which still validates.
 */

export const PROJECT_ADDRESSES: Record<
  string,
  { streetAddress: string; addressLocality: string; postalCode: string }
> = {
  "residence-prime": {
    streetAddress: "Ban Don-Cherngtalay Road (Laguna area)",
    addressLocality: "Choeng Thale, Thalang",
    postalCode: "83110",
  },
  "trinity-village": {
    streetAddress: "Soi Pasak 8",
    addressLocality: "Choeng Thale, Thalang",
    postalCode: "83110",
  },
  victory: {
    streetAddress: "Near the Heroines Monument",
    addressLocality: "Thep Krasattri, Thalang",
    postalCode: "83110",
  },
};
