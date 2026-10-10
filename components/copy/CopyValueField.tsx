"use client";

/**
 * components/copy/CopyValueField.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One language of one copy string, as an editor sees it — shared by the
 * /admin/pages/copy grid (SiteCopyForm) and the "edit text" picker on the
 * public site (components/edit/CopyPicker.tsx).
 *
 * Plain text is a plain text box. A counted message — "{count, plural, =4
 * {Four things we do in-house} other {# things we do in-house}}" — is one
 * box per case, labelled in words ("When the number is 4", "Any other
 * number"), with the braces and keywords kept out of reach: see
 * lib/icu-skeleton.ts for how it is split and spliced back. "Edit as
 * code" is one click away for the rare change the boxes cannot express
 * (adding a case), and that is the only place the source is shown.
 *
 * The value the parent holds is always the full message string, so its
 * dirty check, validation, "use default" and save are unchanged. The
 * boxes keep their own copy of the case texts: typing a `{` into one
 * makes the assembled message invalid (and the parent says so), and
 * re-deriving the boxes from an unparseable string would throw the
 * person back into the code view mid-word.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { assembleSkeleton, icuSkeleton, type IcuSkeleton, type SkeletonSlot } from "@/lib/icu-skeleton";

type Props = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  lang: string;
  /** Rows for the plain / code text box. */
  rows: number;
  invalid?: boolean;
  describedBy?: string;
  /** Classes for every text box this draws (border tone included). */
  className: string;
  /**
   * The default for this language. When the default is counted but the
   * saved text is one plain sentence (an override that dropped the cases),
   * the field says so and offers to split it back into cases — otherwise
   * the same string drew as one box in one language and as per-case boxes
   * in the language beside it, with nothing to say why.
   */
  fallback?: string;
  /**
   * The quick view, for the site picker: a counted message opens as one box
   * — the case on screen (`primary`), or the first — exactly like a plain
   * heading beside it, with "the other numbers" one click away. A plain
   * override of a counted default is just its box, no note. The admin grid
   * leaves this off and shows every case, since it is where the whole
   * message is maintained.
   */
  simple?: boolean;
  /** The case selector to open on in the quick view, e.g. "=4". */
  primary?: string | null;
  /** Leave out the "this changes with a number" line — for the grid, which
   *  says it once per row rather than in all four columns. */
  compact?: boolean;
};

type Parsed = { skeleton: IcuSkeleton | null; texts: string[]; assembled: string };

function parseValue(value: string): Parsed {
  const skeleton = icuSkeleton(value);
  return { skeleton, texts: skeleton?.slots.map((slot) => slot.text) ?? [], assembled: value };
}

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many"];

export default function CopyValueField({
  id,
  value,
  onChange,
  lang,
  rows,
  invalid,
  describedBy,
  className,
  compact = false,
  fallback,
  simple = false,
  primary = null,
}: Props) {
  const t = useTranslations("editMode.cases");
  const [parsed, setParsed] = useState<Parsed>(() => parseValue(value));
  const [asCode, setAsCode] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // The value changed from outside ("use default", discard, a save): start
  // the boxes over from it. Adjusting state during render, as React
  // documents for derived state, rather than an effect that would draw
  // one frame of stale boxes first.
  // The person's own typing never lands here: update() records what it
  // assembled before handing it up, so a mid-way invalid case text keeps
  // its boxes.
  if (value !== parsed.assembled) setParsed(parseValue(value));

  const skeleton = parsed.skeleton;
  const defaultSkeleton = !skeleton && fallback && !simple ? icuSkeleton(fallback) : null;

  /** One plain sentence → the default's cases, every case starting from it. */
  const splitIntoCases = () => {
    if (!defaultSkeleton) return;
    const plain = value.trim();
    const texts = defaultSkeleton.slots.map((slot) => (slot.kind === "case" ? plain : ""));
    setAsCode(false);
    onChange(assembleSkeleton(defaultSkeleton, texts));
  };

  if (!skeleton || asCode) {
    return (
      <div className="space-y-1">
        <textarea
          id={id}
          lang={lang}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={className}
        />
        {skeleton && (
          <button
            type="button"
            onClick={() => setAsCode(false)}
            className="text-[11.5px] underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            {t("asCases")}
          </button>
        )}
        {defaultSkeleton && (
          <p className="text-[11.5px] leading-snug">
            <span className="opacity-70">{t("single")}</span>{" "}
            <button
              type="button"
              onClick={splitIntoCases}
              className="underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              {t("split")}
            </button>
          </p>
        )}
      </div>
    );
  }

  const label = (slot: SkeletonSlot): string => {
    if (slot.kind !== "case") return t(slot.kind);
    const exact = slot.selector.match(/^=(\d+)$/);
    if (exact) return t("exact", { n: exact[1] });
    if (slot.selector === "other") return t("other");
    if (skeleton.type !== "select" && PLURAL_CATEGORIES.includes(slot.selector)) {
      return t(`category.${slot.selector}` as never);
    }
    return t("selectValue", { value: slot.selector });
  };

  const usesNumber = skeleton.type !== "select" && parsed.texts.some((text) => text.includes("#"));

  const update = (index: number, text: string) => {
    const texts = parsed.texts.map((current, i) => (i === index ? text : current));
    const assembled = assembleSkeleton(skeleton, texts);
    setParsed({ skeleton, texts, assembled });
    onChange(assembled);
  };

  // The quick view: one box, the case on screen, like any other heading.
  if (simple && !expanded) {
    const cases = skeleton.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.kind === "case");
    const shown =
      cases.find(({ slot }) => slot.kind === "case" && slot.selector === primary) ?? cases[0];
    const others = skeleton.slots.length - 1;
    return (
      <div className="space-y-1">
        <textarea
          id={id}
          lang={lang}
          rows={rows}
          value={parsed.texts[shown.index]}
          onChange={(event) => update(shown.index, event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className={className}
        />
        {others > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11.5px] underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            {t("more", { count: others })}
          </button>
        )}
      </div>
    );
  }

  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      className="min-w-0 space-y-1.5"
    >
      <legend className="sr-only">{t("legend")}</legend>
      {(!compact || simple) && (
        <p className="text-[11.5px] leading-snug opacity-70">
          {skeleton.type === "select" ? t("introSelect") : t("intro")}
          {usesNumber && <> {t("pound")}</>}
        </p>
      )}
      {skeleton.slots.map((slot, index) => {
        const fieldId = index === 0 ? id : `${id}-${index}`;
        return (
          <div key={index} className="space-y-0.5">
            <label htmlFor={fieldId} className="block text-[11.5px] font-medium opacity-80">
              {label(slot)}
            </label>
            <textarea
              id={fieldId}
              lang={lang}
              rows={parsed.texts[index].length > 70 ? 2 : 1}
              value={parsed.texts[index]}
              onChange={(event) => update(index, event.target.value)}
              aria-invalid={invalid ? true : undefined}
              className={className}
            />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-3">
        {simple && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11.5px] underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            {t("less")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setAsCode(true)}
          className="text-[11.5px] underline underline-offset-2 opacity-60 hover:opacity-100"
        >
          {t("asCode")}
        </button>
      </div>
    </fieldset>
  );
}
