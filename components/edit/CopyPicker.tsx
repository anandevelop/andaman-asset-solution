"use client";

/**
 * components/edit/CopyPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Edit text" on the public site: with the mode on (EditBar), the next
 * click on any words on the page opens a side panel with those words in
 * all four languages, saved straight to the site-copy overrides — the
 * same rows /admin/pages/copy edits, through the same save rules.
 *
 * HOW A CLICK BECOMES A KEY
 *
 * The cached page carries no keys (see lib/edit-mode.ts for why nothing
 * editor-specific can be in the HTML). So the picker sends the clicked
 * element's text, and its parents' for text split across tags, to
 * findCopyForText, which matches it against what the site currently
 * prints in this language. Text that is not site copy — a project's name,
 * an article body — matches nothing, and the panel says where those are
 * edited instead.
 *
 * LIVE PREVIEW, CAREFULLY
 *
 * When the clicked element holds a single text node that is exactly the
 * matched copy, typing in this page's language rewrites that node's
 * nodeValue (never the element's children: React owns those, and
 * replacing the node would break its next update). Closing the panel puts
 * the original back; a save reloads the page, which the save has already
 * revalidated.
 *
 * Clicks are taken in the capture phase and stopped, so links and buttons
 * on the page do not fire while picking. Anything inside [data-edit-ui]
 * (the bar, this panel) is left alone.
 *
 * UNSAVED TEXT IS NEVER DROPPED SILENTLY
 *
 * Picking something else, Esc, ✕, Cancel and turning the mode off from the
 * bar all ask first when the panel holds unsaved text. Esc is two steps:
 * the first closes the panel, the second leaves picking mode.
 *
 * WHEN THE WORDS ARE NOT SITE COPY
 *
 * A project's name or an article's body lives in its own editor. The
 * section and card wrappers (EditableSection, EditableItem) leave their
 * admin links on the DOM for editors, so "not found" can offer the screen
 * that does own the words rather than only saying where not to look.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, MousePointerClick, Pencil, X } from "lucide-react";
import {
  findCopyForText,
  saveCopyFromSite,
  type PickedCopy,
} from "@/app/[locale]/(site)/_actions/site-copy";
import { normalizeCopyText, validateCopy, type CopyProblem } from "@/lib/site-copy-core";
import { withReturnTo, type EditLink } from "@/lib/edit-mode";
import CopyValueField from "@/components/copy/CopyValueField";
import { caseShowing } from "@/lib/icu-skeleton";
import { useEditMode } from "./EditModeProvider";

const LANGUAGE_NAMES: Record<string, string> = { th: "ไทย", en: "English", zh: "中文", ru: "Русский" };

type Picked =
  | { status: "loading" }
  | { status: "none" }
  | { status: "error" }
  | { status: "found"; matches: PickedCopy[] };

function isEditUi(el: Element | null): boolean {
  return Boolean(el?.closest("[data-edit-ui]"));
}

/** The clicked element's text, then its parents', innermost first. */
function candidatesFrom(target: Element): string[] {
  const out: string[] = [];
  let el: Element | null = target;
  for (let depth = 0; el && el !== document.body && depth < 4; depth++, el = el.parentElement) {
    const raw = el instanceof HTMLElement ? el.innerText : (el.textContent ?? "");
    const text = normalizeCopyText(raw ?? "");
    if (text && text.length <= 600 && !out.includes(text)) out.push(text);
  }
  return out;
}

/** The admin screens that own the clicked spot: the card's, then the section's. */
function ownersOf(el: Element): { item: string | null; links: EditLink[] } {
  const item = el.closest("[data-edit-item]")?.getAttribute("data-edit-item") ?? null;
  let links: EditLink[] = [];
  try {
    const raw = el.closest("[data-edit-links]")?.getAttribute("data-edit-links");
    links = raw ? (JSON.parse(raw) as EditLink[]) : [];
  } catch {
    links = [];
  }
  return { item, links };
}

/** The one non-blank text node an element holds, or null. */
function soleTextNode(el: Element): Text | null {
  const nodes = Array.from(el.childNodes).filter(
    (node) => node.nodeType !== Node.TEXT_NODE || (node.nodeValue ?? "").trim() !== "",
  );
  return nodes.length === 1 && nodes[0].nodeType === Node.TEXT_NODE ? (nodes[0] as Text) : null;
}

export default function CopyPicker({ locale }: { locale: string }) {
  const t = useTranslations("editMode.picker");
  const tEdit = useTranslations("editMode");
  const pathname = usePathname();
  const mode = useEditMode();
  const picking = Boolean(mode?.picking);
  const setPicking = mode?.setPicking;
  const setPickGuard = mode?.setPickGuard;
  const adminBase = mode?.adminBase ?? "/th/admin";

  const [box, setBox] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [index, setIndex] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, CopyProblem>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  /** The clicked text, kept to tell which case of a counted message it is. */
  const [seen, setSeen] = useState<string[]>([]);
  const [owners, setOwners] = useState<{ item: string | null; links: EditLink[] }>({ item: null, links: [] });

  const clicked = useRef<Element | null>(null);
  const hovered = useRef<Element | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  /** Mirrors `dirty.length > 0` for the event handlers below. */
  const hasUnsaved = useRef(false);
  const preview = useRef<{ node: Text; original: string; key: string } | null>(null);

  const restorePreview = useCallback(() => {
    if (preview.current) {
      preview.current.node.nodeValue = preview.current.original;
      preview.current = null;
    }
  }, []);

  const close = useCallback(() => {
    hasUnsaved.current = false;
    restorePreview();
    setPreviewing(false);
    setPicked(null);
    setEdits({});
    setErrors({});
    setFailed(false);
  }, [restorePreview]);

  /** True when it is fine to drop what the panel holds. */
  const confirmDiscard = useCallback(
    () => !hasUnsaved.current || window.confirm(t("discardConfirm")),
    [t],
  );

  /** Close the panel, asking first when it holds unsaved text. */
  const requestClose = useCallback(() => {
    if (!confirmDiscard()) return false;
    close();
    return true;
  }, [confirmDiscard, close]);

  /** Live preview for `match`, if the clicked element is exactly that
   *  text and nothing else. Called from the handlers that change it. */
  const armPreview = useCallback(
    (match: PickedCopy | undefined) => {
      restorePreview();
      setPreviewing(false);
      const el = clicked.current;
      if (!match || !el || match.args.length > 0 || match.tags.length > 0) return;
      const cell = match.cells.find((c) => c.locale === locale);
      const node = soleTextNode(el);
      if (!cell || !node) return;
      const shown = cell.saved ?? cell.fallback;
      if (normalizeCopyText(node.nodeValue ?? "") !== normalizeCopyText(shown)) return;
      preview.current = { node, original: node.nodeValue ?? "", key: match.key };
      setPreviewing(true);
    },
    [locale, restorePreview],
  );

  // Picking: outline what is under the pointer, take the next click.
  useEffect(() => {
    if (!picking) return;

    const measure = () => {
      const el = hovered.current;
      setBox(el && el.isConnected ? el.getBoundingClientRect() : null);
    };

    const over = (event: MouseEvent) => {
      const el = event.target as Element | null;
      hovered.current = el && !isEditUi(el) ? el : null;
      measure();
    };

    const click = (event: MouseEvent) => {
      const el = event.target as Element | null;
      if (!el || isEditUi(el)) return;
      event.preventDefault();
      event.stopPropagation();

      // A stray click while typing must not throw the typing away.
      if (!confirmDiscard()) return;

      restorePreview();
      clicked.current = el;
      setOwners(ownersOf(el));
      setPicked({ status: "loading" });
      setIndex(0);
      setEdits({});
      setErrors({});
      setFailed(false);

      const candidates = candidatesFrom(el);
      setSeen(candidates);
      findCopyForText(locale, candidates)
        .then((matches) => {
          setPicked(matches.length > 0 ? { status: "found", matches } : { status: "none" });
          armPreview(matches[0]);
        })
        .catch(() => setPicked({ status: "error" }));
    };

    document.addEventListener("mouseover", over, true);
    document.addEventListener("click", click, true);
    // The outline is position: fixed; keep it on the element as the page moves.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      hovered.current = null;
      setBox(null);
    };
  }, [picking, locale, confirmDiscard, restorePreview, armPreview]);

  // Esc: first closes the panel, then leaves picking mode.
  useEffect(() => {
    if (!picking && !picked) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (picked) requestClose();
      else setPicking?.(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [picking, picked, requestClose, setPicking]);

  // Turning the mode off from the bar asks the same question, through the
  // provider (setPicking is guarded), and then takes the panel with it —
  // a panel left open after the mode ends had no Esc and kept its preview.
  useEffect(() => {
    setPickGuard?.(confirmDiscard);
    return () => setPickGuard?.(null);
  }, [setPickGuard, confirmDiscard]);

  useEffect(() => {
    // Reacting to the mode ending; close() only resets panel state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!picking) close();
  }, [picking, close]);

  // Move focus into the panel when it opens, so keyboard and screen-reader
  // users land on what just appeared rather than somewhere behind it.
  const panelOpen = picked !== null;
  useEffect(() => {
    if (panelOpen) panelRef.current?.focus();
  }, [panelOpen]);

  const match = picked?.status === "found" ? picked.matches[index] : null;

  // For a counted message, the case the page is showing in this language
  // ("=4" for "Four things we do in-house"); every language opens on it.
  const primaryCase = useMemo(() => {
    const cell = match?.cells.find((c) => c.locale === locale);
    if (!match?.icu || !cell) return null;
    return caseShowing(cell.saved ?? cell.fallback, seen) ?? caseShowing(cell.fallback, seen);
  }, [match, locale, seen]);

  const dirty = useMemo(() => {
    if (!match) return [];
    return match.cells
      .map((cell) => ({ cell, value: edits[`${cell.locale}:${match.key}`] }))
      .filter(({ cell, value }) => value !== undefined && value !== (cell.saved ?? cell.fallback))
      .map(({ cell, value }) => ({ locale: cell.locale, key: match.key, value: value as string, cell }));
  }, [edits, match]);

  useEffect(() => {
    hasUnsaved.current = dirty.length > 0;
  }, [dirty]);

  const localErrors = useMemo(() => {
    const out: Record<string, CopyProblem> = {};
    if (!match?.icu) return out;
    for (const { cell, value, locale: l } of dirty) {
      if (value.trim() === "") continue;
      const problem = validateCopy(cell.fallback, value);
      if (problem) out[`${l}:${match.key}`] = problem;
    }
    return out;
  }, [dirty, match]);

  const problemText = (problem: CopyProblem) =>
    problem.code === "SYNTAX"
      ? t("errors.syntax")
      : problem.code === "UNKNOWN_ARGUMENT"
        ? t("errors.unknownArgument", { name: problem.name })
        : t("errors.unknownTag", { name: problem.name });

  const save = async () => {
    if (!match || dirty.length === 0) return;
    setSaving(true);
    setFailed(false);
    try {
      const result = await saveCopyFromSite(dirty.map(({ locale: l, key, value }) => ({ locale: l, key, value })));
      if (result.ok) {
        // The save revalidated every route; show the page as visitors will.
        preview.current = null;
        window.location.reload();
        return;
      }
      setErrors(result.errors);
      setFailed(Boolean(result.failed));
    } catch {
      setFailed(true);
    }
    setSaving(false);
  };

  if (!mode?.canEdit) return null;

  return (
    <>
      {picking && box && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[65] rounded-md border-2 border-dashed border-amber-400 bg-amber-300/10"
          style={{ top: box.top - 3, left: box.left - 3, width: box.width + 6, height: box.height + 6 }}
        />
      )}

      {picking && !picked && (
        <div
          data-edit-ui
          role="status"
          className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-[13px] text-white shadow-xl print:hidden"
        >
          <MousePointerClick size={15} className="text-amber-300" aria-hidden />
          {t("hint")}
        </div>
      )}

      {picked && (
        <aside
          ref={panelRef}
          tabIndex={-1}
          data-edit-ui
          role="dialog"
          aria-label={t("title")}
          className="fixed outline-none inset-y-0 right-0 z-[70] flex w-full flex-col overflow-y-auto bg-white text-[14px] text-gray-900 shadow-2xl sm:w-[420px] print:hidden"
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">{t("title")}</h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t("close")}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 px-5 py-4">
            {picked.status === "loading" && (
              <p className="flex items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" aria-hidden />
                {t("loading")}
              </p>
            )}

            {(picked.status === "none" || picked.status === "error") && (
              <div className="space-y-2">
                <p className="font-medium">{picked.status === "none" ? t("notFound") : t("failedLookup")}</p>
                <p className="text-gray-600">{t("notFoundHint")}</p>
                {(owners.item || owners.links.length > 0) && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[13px] text-gray-600">{t("ownedBy")}</p>
                    <div className="flex flex-col gap-2">
                      {owners.item && (
                        <a
                          href={withReturnTo(`${adminBase}${owners.item}`, pathname)}
                          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500"
                        >
                          <Pencil size={14} aria-hidden />
                          {tEdit("editItem")}
                        </a>
                      )}
                      {owners.links.map((link) => (
                        <a
                          key={link.href}
                          href={withReturnTo(`${adminBase}${link.href}`, pathname)}
                          className="inline-flex items-center gap-2 rounded-md border border-blue-600 px-3 py-2 font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil size={14} aria-hidden />
                          {tEdit("editLabel", { name: tEdit(`editors.${link.labelKey}` as never) })}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {match && picked.status === "found" && (
              <>
                {picked.matches.length > 1 && (
                  <div className="space-y-1.5">
                    <label htmlFor="copy-picker-match" className="text-[13px] text-gray-600">
                      {t("matches")}
                    </label>
                    <select
                      id="copy-picker-match"
                      value={index}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!confirmDiscard()) return;
                        hasUnsaved.current = false;
                        setIndex(next);
                        setEdits({});
                        setErrors({});
                        armPreview(picked.matches[next]);
                      }}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-2"
                    >
                      {picked.matches.map((m, i) => (
                        <option key={m.key} value={i}>
                          {m.where} · {m.kind}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium text-gray-800">
                    {match.where} <span className="font-normal text-gray-500">· {match.kind}</span>
                  </p>
                  <p className="break-all font-mono text-[11px] text-gray-400">{match.key}</p>
                </div>

                {(match.args.length > 0 || match.tags.length > 0) && (
                  <p className="rounded-md bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800">
                    {t("placeholders", {
                      list: [...match.args.map((a) => `{${a}}`), ...match.tags.map((g) => `<${g}>`)].join(" "),
                    })}
                  </p>
                )}

                {match.cells.map((cell) => {
                  const id = `${cell.locale}:${match.key}`;
                  const current = cell.saved ?? cell.fallback;
                  const value = edits[id] ?? current;
                  const isDirty = value !== current;
                  const problem = localErrors[id] ?? errors[id];
                  const status = isDirty ? t("status.unsaved") : cell.saved !== null ? t("status.edited") : t("status.default");
                  return (
                    <div key={cell.locale} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`copy-picker-${cell.locale}`} className="font-semibold">
                          {LANGUAGE_NAMES[cell.locale] ?? cell.locale}
                        </label>
                        {cell.locale === "th" && <span className="text-[12px] text-gray-500">{t("primaryLanguage")}</span>}
                        <span
                          className={`text-[12px] ${isDirty ? "text-blue-700" : cell.saved !== null ? "text-amber-700" : "text-gray-500"}`}
                        >
                          · {status}
                        </span>
                        {value !== cell.fallback && (
                          <button
                            type="button"
                            onClick={() => {
                              setEdits((prev) => ({ ...prev, [id]: cell.fallback }));
                              if (cell.locale === locale && preview.current?.key === match.key) {
                                preview.current.node.nodeValue = cell.fallback;
                              }
                            }}
                            className="ml-auto text-[12px] text-blue-700 underline underline-offset-2"
                          >
                            {t("useDefault")}
                          </button>
                        )}
                      </div>
                      <CopyValueField
                        id={`copy-picker-${cell.locale}`}
                        lang={cell.locale}
                        rows={current.length > 120 ? 4 : 2}
                        value={value}
                        onChange={(next) => {
                          setEdits((prev) => ({ ...prev, [id]: next }));
                          if (cell.locale === locale && preview.current?.key === match.key) {
                            preview.current.node.nodeValue = next.trim() ? next : cell.fallback;
                          }
                        }}
                        invalid={Boolean(problem)}
                        describedBy={problem ? `copy-picker-${cell.locale}-error` : undefined}
                        fallback={cell.fallback}
                        simple
                        primary={primaryCase}
                        className={`w-full resize-y rounded-md border px-3 py-2 leading-snug outline-none focus:ring-3 ${
                          problem
                            ? "border-red-600 focus:ring-red-200"
                            : "border-gray-300 focus:border-blue-600 focus:ring-blue-100"
                        }`}
                      />
                      {problem && (
                        <p id={`copy-picker-${cell.locale}-error`} role="alert" className="text-[12.5px] text-red-700">
                          {problemText(problem)}
                        </p>
                      )}
                    </div>
                  );
                })}

                {previewing && <p className="text-[12.5px] text-gray-500">{t("previewNote")}</p>}
              </>
            )}
          </div>

          <div className="sticky bottom-0 space-y-2 border-t border-gray-200 bg-white px-5 py-3.5">
            {failed && (
              <p role="alert" className="text-[13px] text-red-700">
                {t("saveFailed")}
              </p>
            )}
            <div className="flex items-center gap-2">
              {match && (
                <a
                  href={withReturnTo(`${adminBase}/pages/copy?key=${encodeURIComponent(match.key)}`, pathname)}
                  className="mr-auto inline-flex items-center gap-1 text-[13px] text-blue-700 hover:underline"
                >
                  {t("openInAdmin")}
                  <ExternalLink size={13} aria-hidden />
                </a>
              )}
              <button
                type="button"
                onClick={requestClose}
                className={`rounded-md border border-gray-300 px-3.5 py-2 hover:bg-gray-50 ${match ? "" : "ml-auto"}`}
              >
                {t("cancel")}
              </button>
              {match && (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || dirty.length === 0 || Object.keys(localErrors).length > 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
                  {saving ? t("saving") : t("save")}
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
