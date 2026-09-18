"use client";

/**
 * components/admin/SlugField.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The URL slug input shared by the Project/News/Event/E-Brochure editors.
 * A plain uncontrolled <input> made writing "The Victory Villas" and
 * expecting "the-victory-villas" fail silently — nothing corrected it, so
 * the field just sat on an invalid value until save rejected it. This
 * normalizes as the editor types (slugifyLive) and cleans up any stray
 * edge hyphen once they leave the field (slugify on blur).
 *
 * `pattern` stays as a no-JS/paste-without-blur fallback — normal typing
 * never reaches it now that the value is corrected live.
 *
 * `onChange` is an optional side-channel, not a controlled-mode switch like
 * SeoPreviewFields's — this field keeps owning its value either way. It
 * exists because NewsForm's live SEO panel (lib/article-seo.ts's slug-format
 * check, and the SERP preview's URL) needs to see the slug as it's typed,
 * not just the value it started with.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { slugify, slugifyLive } from "@/lib/slugify";

type Props = {
  id: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  onChange?: (value: string) => void;
};

export default function SlugField({
  id,
  name = "slug",
  defaultValue = "",
  required,
  className,
  onChange,
}: Props) {
  const [value, setValue] = useState(() => slugify(defaultValue));

  const update = (next: string) => {
    setValue(next);
    onChange?.(next);
  };

  return (
    <input
      id={id}
      name={name}
      value={value}
      onChange={(event) => update(slugifyLive(event.target.value))}
      onBlur={() => setValue((current) => {
        const cleaned = slugify(current);
        onChange?.(cleaned);
        return cleaned;
      })}
      required={required}
      pattern="[a-z0-9]+(-[a-z0-9]+)*"
      className={className}
    />
  );
}
