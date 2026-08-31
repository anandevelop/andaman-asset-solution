/**
 * components/FaqAccordion.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ accordion built on <details>/<summary>.
 *
 * No JavaScript at all. The native element gives keyboard support, screen
 * reader semantics, and — the part that matters for SEO — content that is
 * present in the DOM whether or not it is open, so a crawler reads every
 * answer. A React accordion that unmounts closed panels hides the answers
 * from exactly the audience the FAQPage schema is aimed at.
 *
 * Answers are Markdown, sanitized in lib/faqs.ts before they arrive here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ChevronDown } from "lucide-react";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { groupByCategory, type Faq } from "@/lib/faqs";

type Props = {
  faqs: Faq[];
  labels: {
    eyebrow: string;
    title: string;
    subtitle?: string;
    /** Category id → display name. Unknown ids fall back to the raw value. */
    categories?: Record<string, string>;
  };
  /** Emit FAQPage structured data. One per page — see the note below. */
  withSchema?: boolean;
  tone?: "default" | "muted";
  /** Unique when two accordions share a page. */
  id?: string;
};

export default function FaqAccordion({
  faqs,
  labels,
  withSchema = false,
  tone = "default",
  id = "faq",
}: Props) {
  if (faqs.length === 0) return null;

  const groups = groupByCategory(faqs);
  const grouped = groups.length > 1;

  return (
    <section
      id={id}
      className={
        tone === "muted"
          ? "scroll-mt-24 bg-primary-900/[0.03] py-20 sm:py-28"
          : "scroll-mt-24 py-20 sm:py-28"
      }
    >
      {/*
        Google accepts one FAQPage block per page and ignores the rest, so
        the caller decides which accordion owns it. Answers go in as plain
        text: the schema spec allows limited HTML, but a mismatch between
        the markup here and there is a common cause of a failed rich result.
      */}
      {withSchema && (
        <JsonLd
          id={`${id}-schema`}
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answerText },
            })),
          }}
        />
      )}

      <div className="container-luxe">
        {/* Centered rather than left-aligned like most sections on this
            page — a wide "Questions" heading followed by a single narrow
            column of rows read as accidentally off-balance on desktop,
            with most of the container sitting empty beside it. Centering
            both the header and the accordion column below it turns that
            same content into a deliberate, minimal single-column layout
            instead. Rows themselves stay left-aligned — a centered
            question/answer reads awkwardly once you're actually reading
            it, the outer column is what needed centering, not the text. */}
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">{labels.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-light text-primary sm:text-4xl">
            {labels.title}
          </h2>
          {labels.subtitle && (
            <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-ink/70">
              {labels.subtitle}
            </p>
          )}
        </Reveal>

        <div className="mx-auto mt-14 max-w-2xl space-y-10">
          {groups.map(([category, entries]) => (
            <div key={category ?? "other"}>
              {grouped && category && (
                <h3 className="mb-4 text-center text-xs font-semibold uppercase tracking-widest2 text-accent-700">
                  {labels.categories?.[category] ?? category}
                </h3>
              )}

              <div className="divide-y divide-primary/8 border-y border-primary/10">
                {entries.map((faq, index) => (
                  <Reveal key={faq.id} delay={Math.min(index, 5) * 0.05}>
                    <details className="group">
                      <summary
                        className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-left transition-colors hover:text-accent-800 [&::-webkit-details-marker]:hidden"
                      >
                        <span className="text-base font-light leading-snug text-primary group-hover:text-accent-800">
                          {faq.question}
                        </span>

                        <ChevronDown
                          size={16}
                          strokeWidth={1.5}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-accent-700 transition-transform duration-300 group-open:rotate-180"
                        />
                      </summary>

                      {/* Sanitized in lib/faqs.ts. */}
                      <div
                        className="prose-article pb-6 pr-8 text-sm"
                        dangerouslySetInnerHTML={{ __html: faq.answerHtml }}
                      />
                    </details>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
