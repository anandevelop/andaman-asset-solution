/**
 * Google truncates a rendered title around 60 characters for most queries,
 * so anything past that is written for nobody.
 *
 * TITLE_MAX_LENGTH is exported and lib/seo-audit.ts imports it rather than
 * keeping its own 60 — the dashboard and the rule disagreeing about where
 * "too long" starts is exactly the kind of drift this phase is meant to
 * end.
 */
import { fail, pass, skip, type SeoRule } from "@/lib/seo/types";

export const TITLE_MAX_LENGTH = 60;

export const titleLengthRule: SeoRule = {
  key: "title-length",
  severity: "warning",
  weight: 6,
  check(input) {
    const title = input.title.trim();
    if (title.length === 0) return skip("no title");
    if (title.length <= TITLE_MAX_LENGTH) return pass;

    return fail(`${title.length}`);
  },
};
