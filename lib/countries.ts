/**
 * lib/countries.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One country list, shared by the phone dial-code picker and the
 * nationality picker in components/CountrySelect.tsx, the E.164
 * assembly/validation LeadForm.tsx and lib/validations.ts both need, and
 * the ISO2 check lib/validations.ts runs on a submitted
 * `phoneCountry`/`nationality` value.
 *
 * NOT server-only. This module is imported from a "use client" component
 * (CountrySelect, LeadForm) as well as from the API route, so it has to
 * bundle for the browser — see the size notes below for what that costs.
 *
 * THREE THIRD-PARTY DATASETS, NOT ONE HAND-WRITTEN TABLE
 *
 *   · i18n-iso-countries  — country names in en/th/zh/ru, all 250
 *     ISO-3166-1 entries, verified to cover every code this file keeps
 *     (see "the final list" below).
 *   · libphonenumber-js   — which of those 250 codes can actually be
 *     dialled, what calling code reaches them, and (via the
 *     phonePlaceholderFor/toE164/detectFromInternational/
 *     isValidPhoneForCountry helpers below) parsing and validating a
 *     number against a chosen country. Its /min entry point
 *     (metadata.min.json, ~84KB vs. the default's ~156KB) is used
 *     everywhere in this file, since nothing here needs the extended
 *     phone-type metadata the default import carries — the one exception
 *     is examples.mobile.json (~4KB), pulled in only for realistic
 *     per-country placeholder numbers.
 *   · flag-icons          — the SVGs themselves, copied into public/flags
 *     by scripts/copy-flag-assets.mjs (see that file for why SVG, not the
 *     Unicode flag emoji Windows renders as bare letters).
 *
 * THE FIELD IS CALLED `demonym`, AND HOLDS A COUNTRY NAME
 *
 * A true demonym ("Thai", "British") in four languages for all ~195
 * inhabited territories has no reliable multi-language data source: the
 * one npm package offering multi-country demonyms covers ~100 countries
 * in English only and was published days before this file was written,
 * from a single, brand-new maintainer with no track record — not
 * something to depend on for public-facing form copy. Hand-writing the
 * other ~150 in English and all of them in Thai/Chinese/Russian risks
 * getting a real country's nationality label quietly wrong, which is a
 * worse failure than a label that is accurate but not grammatically a
 * demonym. So this field holds the same localised country name
 * `name` does — which is also, in practice, how most passport/visa forms
 * ask the same question ("Nationality: Thailand", not "Nationality:
 * Thai"). Kept as its own field (rather than deleting it and having
 * CountrySelect read `name` for both variants) so a future switch to a
 * real demonym source touches this one file.
 *
 * THE FINAL LIST: ISO NAMES ∩ DIALLABLE
 *
 * i18n-iso-countries has 250 entries; libphonenumber-js recognises 245.
 * The seven ISO entries with no calling code at all (Antarctica, Bouvet
 * Island, French Southern Territories, Heard/McDonald Islands, Pitcairn,
 * South Georgia, the US Minor Outlying Islands — all uninhabited or
 * near enough) and the two dialable codes with no ISO name of their own
 * (Ascension Island, Tristan da Cunha, both dependencies already reached
 * through Saint Helena's own entry) are dropped by the intersection
 * below, leaving 243 — every real nation and inhabited territory,
 * verified to have a name in all four locales and a flag-icons SVG.
 * ─────────────────────────────────────────────────────────────────────────
 */

import isoCountries from "i18n-iso-countries";
import isoCountriesEn from "i18n-iso-countries/langs/en.json";
import isoCountriesTh from "i18n-iso-countries/langs/th.json";
import isoCountriesZh from "i18n-iso-countries/langs/zh.json";
import isoCountriesRu from "i18n-iso-countries/langs/ru.json";
import {
  getCountries as getDialableCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import examplePhoneNumbers from "libphonenumber-js/examples.mobile.json";
import { locales, type Locale } from "@/i18n";

isoCountries.registerLocale(isoCountriesEn);
isoCountries.registerLocale(isoCountriesTh);
isoCountries.registerLocale(isoCountriesZh);
isoCountries.registerLocale(isoCountriesRu);

export type Country = {
  /** ISO 3166-1 alpha-2, upper-case — "TH". */
  iso2: string;
  /** "+66" — always the "+" prefix, ready to prepend to a national number. */
  dial: string;
  name: Record<Locale, string>;
  /** See this file's header for why this holds a country name. */
  demonym: Record<Locale, string>;
};

const COUNTRIES: readonly Country[] = (() => {
  const dialable = new Set(getDialableCountries());
  const namesByLocale = Object.fromEntries(
    locales.map((locale) => [locale, isoCountries.getNames(locale)]),
  ) as Record<Locale, Record<string, string>>;

  const rows: Country[] = [];

  for (const iso2 of Object.keys(namesByLocale.en)) {
    if (!dialable.has(iso2 as CountryCode)) continue;

    const name = Object.fromEntries(
      locales.map((locale) => [locale, namesByLocale[locale][iso2]]),
    ) as Record<Locale, string>;

    // Any i18n-iso-countries entry can return an "A, B" alternate-names
    // string for a locale with more than one official form (e.g. some
    // ZH entries) — the picker wants one clean label, so only the first
    // is kept.
    for (const locale of locales) {
      name[locale] = name[locale].split(",")[0].trim();
    }

    rows.push({
      iso2,
      dial: `+${getCountryCallingCode(iso2 as CountryCode)}`,
      name,
      demonym: name,
    });
  }

  return rows;
})();

export const DEFAULT_PHONE_COUNTRY = "TH";

export function countryByIso2(iso2: string | null | undefined): Country | null {
  if (!iso2) return null;
  return COUNTRIES.find((c) => c.iso2 === iso2.toUpperCase()) ?? null;
}

export function dialOf(iso2: string): string | null {
  return countryByIso2(iso2)?.dial ?? null;
}

export function isKnownIso2(iso2: string | null | undefined): boolean {
  return countryByIso2(iso2) !== null;
}

/** Same 243 rows, sorted by this locale's own name — country name
 *  alphabetical order does not agree across en/th/zh/ru, so callers ask
 *  for the order they need rather than this module baking in one. */
export function countriesSortedFor(locale: Locale): Country[] {
  return [...COUNTRIES].sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale));
}

/** `/flags/th.svg` — same-origin, copied out of node_modules by
 *  scripts/copy-flag-assets.mjs; see that file and this one's header for
 *  why not the Unicode flag emoji. */
export function flagSrc(iso2: string): string {
  return `/flags/${iso2.toLowerCase()}.svg`;
}

/**
 * What the admin lead pages show for a stored `nationality` value. A lead
 * captured through CountrySelect.tsx holds an ISO2 code and gets a flag;
 * one from before that picker shipped holds whatever free text a visitor
 * typed ("Russian", "รัสเซีย", "RU") and is shown exactly as stored, with
 * no flag — never an error, and never silently blanked, just because it
 * does not parse as a code. See LeadInquiry.nationality in schema.prisma
 * for why old rows are left as free text rather than migrated.
 */
export function nationalityLabel(
  nationality: string | null | undefined,
  locale: Locale,
): { flagSrc: string | null; label: string } | null {
  if (!nationality) return null;

  const country = countryByIso2(nationality);
  if (!country) return { flagSrc: null, label: nationality };

  return { flagSrc: flagSrc(country.iso2), label: country.demonym[locale] };
}

/**
 * "81 234 5678" — a realistic placeholder for just the national part of a
 * number, once the dial code is already shown by the adjacent
 * CountrySelect. International format with the calling code itself
 * stripped off, not libphonenumber-js's own `nationalNumber` — that drops
 * the digit grouping a real Thai/Chinese/etc. number is normally written
 * with, which is the whole point of showing an example at all.
 */
export function phonePlaceholderFor(iso2: string): string | null {
  const example = getExampleNumber(iso2 as CountryCode, examplePhoneNumbers);
  if (!example) return null;
  return example.formatInternational().replace(/^\+\d+\s*/, "");
}

/**
 * Assembles E.164 from a national number typed against a chosen country
 * ("081 234 5678" + TH → "+66812345678"). Returns null for anything that
 * does not even parse as a phone number shape for that country — this is
 * not the stricter "is this a real, dialable number" check LeadForm.tsx
 * shows an error for; see isValidPhoneForCountry for that.
 */
export function toE164(national: string, iso2: string): string | null {
  const parsed = parsePhoneNumberFromString(national, iso2 as CountryCode);
  return parsed?.number ?? null;
}

/**
 * A visitor who starts typing their own "+..." or "00..." is already
 * giving a fully-qualified international number — LeadForm.tsx uses this
 * to swing the country selector to match what they typed, rather than
 * running it through the currently-selected country's rules and mangling
 * or rejecting it.
 */
export function detectFromInternational(raw: string): { iso2: string; e164: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+") && !trimmed.startsWith("00")) return null;

  const withPlus = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const parsed = parsePhoneNumberFromString(withPlus);
  if (!parsed?.country) return null;

  return { iso2: parsed.country, e164: parsed.number };
}

/** The real, stricter check: not just "shaped like E.164" (leadSchema's
 *  regex already covers that) but "a number libphonenumber-js's own
 *  per-country rules recognise as dialable", and for the country the
 *  visitor actually selected — a validly-shaped US number typed while TH
 *  is selected should not pass just because both are 10 digits. */
export function isValidPhoneForCountry(e164: string, iso2: string): boolean {
  const parsed = parsePhoneNumberFromString(e164);
  return !!parsed && parsed.isValid() && parsed.country === iso2.toUpperCase();
}
