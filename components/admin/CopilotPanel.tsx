"use client";

/**
 * components/admin/CopilotPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Copilot column — a shell, behind ADMIN_COPILOT (see
 * lib/admin/copilot.ts for why it answers nothing yet).
 *
 * A column, not an overlay: it is a sibling of the page in the admin
 * layout's flex row, so opening it narrows the page instead of hiding
 * part of it — the thing you would ask about stays visible. Open state is
 * the `copilot` display pref on <html> (CSS variant `copilot-open`), set
 * before paint, so a page loads at its final width.
 *
 * `.` toggles it, ignored while typing (lib/admin/keyboard.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlugZap, Send, Sparkles, X } from "lucide-react";
import { activeItemKey } from "@/lib/admin/nav";
import { COPILOT_SUGGESTIONS, copilotContextFor } from "@/lib/admin/copilot";
import { isTypingTarget } from "@/lib/admin/keyboard";
import { toggleCopilot } from "@/lib/admin/use-display-pref";

export default function CopilotPanel({ locale }: { locale: string }) {
  const t = useTranslations("admin.copilot");
  const tNav = useTranslations("admin.nav");
  const pathname = usePathname();
  const active = activeItemKey(pathname, `/${locale}/admin`);
  const context = copilotContextFor(active);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "." || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleCopilot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      aria-label={t("title")}
      className="hidden w-[380px] shrink-0 flex-col border-l border-adm-line bg-adm-solid copilot-open:lg:sticky copilot-open:lg:top-0 copilot-open:lg:flex copilot-open:lg:h-screen print:hidden"
    >
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-adm-line px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-adm-fill text-adm-on-fill">
          <Sparkles size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t("title")}</p>
          <p className="truncate text-[11px] text-ink-muted">
            {active ? tNav(active as never) : t("contextDefault")}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleCopilot}
          aria-label={t("close")}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] text-ink-muted hover:bg-primary/5 hover:text-ink"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Said first and plainly: nothing typed here goes anywhere yet. */}
        <div className="flex gap-2.5 rounded-[12px] border border-adm-warning/30 bg-adm-warning-bg p-3 text-xs text-adm-warning">
          <PlugZap size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">{t("notConnectedTitle")}</span> {t("notConnectedBody")}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11.5px] font-medium text-ink-muted">{t("suggestionsTitle")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {COPILOT_SUGGESTIONS[context].map((key) => (
              <li key={key}>
                {/* Disabled, not hidden: they show what the panel is for,
                    and that it is per screen. */}
                <button
                  type="button"
                  disabled
                  className="rounded-full border border-adm-line-strong px-3 py-1.5 text-left text-xs text-ink-muted disabled:cursor-not-allowed"
                >
                  {t(`suggest.${context}.${key}` as never)}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-muted">{t("rules")}</p>
      </div>

      <div className="border-t border-adm-line p-3">
        <label className="flex items-end gap-2 rounded-[14px] border border-adm-line-strong px-3 py-2">
          <span className="sr-only">{t("inputLabel")}</span>
          <textarea
            disabled
            rows={1}
            placeholder={t("inputPlaceholder")}
            className="min-h-6 flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-muted/70 focus:outline-hidden disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            aria-label={t("send")}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-adm-fill text-adm-on-fill disabled:opacity-40"
          >
            <Send size={14} aria-hidden />
          </button>
        </label>
      </div>
    </aside>
  );
}
