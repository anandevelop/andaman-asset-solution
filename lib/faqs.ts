/**
 * lib/faqs.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Frequently asked questions.
 *
 * Answers are Markdown, rendered through the same sanitizer as article
 * bodies. An FAQ answer about ownership structures nearly always wants a
 * list and a link to the privacy policy or a guide, and plain text cannot
 * carry either.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";
import { renderMarkdown, markdownToText } from "@/lib/markdown";

export type Faq = {
  id: string;
  question: string;
  /** Sanitized HTML, ready for dangerouslySetInnerHTML. */
  answerHtml: string;
  /** Plain text, for the FAQPage JSON-LD. */
  answerText: string;
  category: string | null;
};

// `satisfies Prisma.FaqSelect` is back — the clause was dropped because
// the generated client did not type `translations`, which it does now. It
// is the check that would have caught this select drifting from the model.
const SELECT = {
  id: true,
  questionEn: true,
  questionTh: true,
  answerEn: true,
  answerTh: true,
  category: true,
  translations: true,
} as const satisfies Prisma.FaqSelect;

type Row = any;

function toFaq(row: Row, locale: string): Faq {
  const t = getTranslation<any>(row.translations, locale);
  const answer = t?.answer ?? pickLocale(locale, row.answerTh, row.answerEn);

  return {
    id: row.id,
    question: t?.question ?? pickLocale(locale, row.questionTh, row.questionEn),
    answerHtml: renderMarkdown(answer),
    answerText: markdownToText(answer),
    category: row.category,
  };
}

/**
 * Published FAQs, optionally narrowed to a set of categories.
 *
 * The project page passes the categories a buyer asks about while looking
 * at a specific development; the home page passes nothing and gets
 * everything.
 */
export async function getFaqs(
  locale: string,
  options: { categories?: string[]; take?: number } = {},
): Promise<Faq[]> {
  const rows = await safeQuery(
    "faq.findMany(published)",
    () =>
      prisma.faq.findMany({
        where: {
          isPublished: true,
          ...(options.categories?.length
            ? { category: { in: options.categories } }
            : {}),
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: options.take,
        select: SELECT,
      }),
    [] as Row[],
  );

  return rows.map((row: Row) => toFaq(row, locale));
}

/** Distinct categories in use, for the admin's suggestion list. */
export async function getFaqCategories(): Promise<string[]> {
  const rows = await safeQuery(
    "faq.findMany(categories)",
    () =>
      prisma.faq.findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),
    [] as { category: string | null }[],
  );

  return rows.map((row) => row.category).filter((c): c is string => Boolean(c));
}

/**
 * Group FAQs by category, preserving the order they arrived in.
 *
 * Uncategorised entries collect under a null key, which the component
 * renders last — an ungrouped question after three labelled sections reads
 * as "other", which is what it is.
 */
export function groupByCategory(faqs: Faq[]): [string | null, Faq[]][] {
  const groups = new Map<string | null, Faq[]>();

  for (const faq of faqs) {
    const existing = groups.get(faq.category);
    if (existing) existing.push(faq);
    else groups.set(faq.category, [faq]);
  }

  return [...groups.entries()].sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return 0;
  });
}
