"use client";

/**
 * components/NewsSearch.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The newsroom's search box.
 *
 * Writes `?q=` into the URL rather than filtering a list in the browser:
 * the index is paginated on the server, so a client-side filter would only
 * ever search the seven articles on the current page and quietly report
 * nothing for an article two pages down.
 *
 * Wrapped in a <form> so pressing Enter searches immediately on a phone,
 * where the debounce is otherwise the only trigger and the on-screen
 * keyboard hides the results.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

const DEBOUNCE_MS = 350;

export default function NewsSearch({
  locale,
  activeSearch,
  labels,
}: {
  locale: string;
  activeSearch: string;
  labels: { placeholder: string; clear: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(activeSearch);

  /* Held in a ref so the debounce timer always fires the newest version —
     capturing it in the effect would either navigate with a stale query
     string or restart the timer on every keystroke's re-render. Same shape
     as the admin filter bars. */
  const push = useRef<(value: string) => void>(() => undefined);
  // eslint-disable-next-line react-hooks/refs -- the latest-ref idiom: the debounce below must call the newest closure, and an effect-assigned ref would hand it a stale query string.
  push.current = (value: string) => {
    const next = new URLSearchParams(params.toString());

    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");

    // A new search starts at the first page; page 3 of the old results is
    // not a page of the new ones.
    next.delete("page");

    const query = next.toString();
    router.replace(`/${locale}/news${query ? `?${query}` : ""}`, { scroll: false });
  };

  // Keeps the box in step when the URL changes underneath it — the back
  // button, or a category chip that dropped the search.
  useEffect(() => {
    setTerm(activeSearch);
  }, [activeSearch]);

  useEffect(() => {
    if (term === activeSearch) return;
    const timer = setTimeout(() => push.current(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, activeSearch]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        push.current(term);
      }}
      className="relative w-full sm:w-64"
    >
      <Search
        size={15}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40"
        aria-hidden
      />
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        className="w-full rounded-full border border-primary/15 bg-white py-2 pl-10 pr-9 text-sm text-ink placeholder:text-ink/45 focus:border-primary/40 focus:outline-hidden focus:ring-0"
      />
      {term && (
        <button
          type="button"
          onClick={() => {
            setTerm("");
            push.current("");
          }}
          aria-label={labels.clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/45 transition-colors hover:text-primary"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </form>
  );
}
