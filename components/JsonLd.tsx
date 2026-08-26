/**
 * components/JsonLd.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Emits a structured-data block for search engines.
 *
 * Two details that matter:
 *  • `<` is escaped to `<` before injection. A string field taken from
 *    the database — an article title containing "</script>" — would
 *    otherwise close the tag early and inject markup into the page.
 *  • Undefined and null members are stripped. Google treats an explicit
 *    null as a malformed value, whereas an absent property is simply an
 *    absent property.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Props = {
  /** Unique per page, used as the DOM id. */
  id: string;
  data: Record<string, unknown>;
};

/** Recursively drop null/undefined and empty arrays. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, member]) => [key, prune(member)] as const)
      .filter(([, member]) => member !== undefined);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return value === null || value === "" ? undefined : value;
}

export default function JsonLd({ id, data }: Props) {
  const json = JSON.stringify(prune(data)).replace(/</g, "\\u003c");

  /*
    A plain <script>, not next/script.

    Structured data has to be in the server-rendered HTML — a crawler that
    does not execute JavaScript still has to find it. next/script cannot
    deliver that here: `beforeInteractive` is only honoured in the root
    layout and is silently downgraded elsewhere, and every other strategy
    injects the tag after hydration. Rendering the tag directly from a
    server component puts it in the initial response, which is what Next's
    own guidance recommends for JSON-LD.
  */
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
