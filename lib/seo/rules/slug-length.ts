/**
 * A slug past 75 characters is usually a title that was slugified whole. It
 * is not penalised hard: long URLs rank, they just read badly in a result
 * and break when someone pastes them into a chat that wraps.
 *
 * Measured on the slug alone, not the full path — the locale prefix and the
 * section are the site's doing, not the author's, and nobody editing a
 * project can shorten "/th/projects/".
 */
import { fail, pass, type SeoRule } from "@/lib/seo/types";

export const SLUG_MAX_LENGTH = 75;

export const slugLengthRule: SeoRule = {
  key: "slug-length",
  severity: "minor",
  weight: 4,
  check(input) {
    return input.slug.length <= SLUG_MAX_LENGTH ? pass : fail(String(input.slug.length));
  },
};
