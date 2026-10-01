/**
 * lib/admin/copilot.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Copilot panel (v4 phase G) — its flag and its per-screen prompts.
 *
 * SHIPPED AS A SHELL, AND OFF
 *
 * There is no model backend in this codebase yet. The panel exists so the
 * shell — the topbar button, the `.` key, a 380px column that pushes the
 * page rather than covering it, the suggestions for the screen you are on
 * — can be built against and reviewed, but it answers nothing: the input
 * is disabled and says why. A panel that invented answers from fake data,
 * as the mockup's does, would be worse than no panel, because someone
 * would act on one.
 *
 * When a backend arrives, the rules it must keep are the phase's own:
 * reads go through the signed-in user's own page loaders and guards
 * (never a query outside lib/permissions.ts), and any write shows a
 * preview and waits for confirmation.
 *
 * ADMIN_COPILOT=1 turns the shell on. A server-side variable on purpose,
 * not NEXT_PUBLIC_: it is read at request time by the admin layout, so
 * one image can have it on in staging and off in production.
 * ─────────────────────────────────────────────────────────────────────────
 */

export function isCopilotEnabled(): boolean {
  return process.env.ADMIN_COPILOT === "1";
}

/** Which prompt set a screen gets — keyed by the active nav item. */
export type CopilotContext = "dashboard" | "leads" | "projects" | "news" | "seo" | "publishing" | "default";

export function copilotContextFor(activeItemKey: string | null): CopilotContext {
  switch (activeItemKey) {
    case "dashboard":
    case "leads":
    case "projects":
    case "news":
    case "seo":
    case "publishing":
      return activeItemKey;
    default:
      return "default";
  }
}

/** Message keys under admin.copilot.suggest.<context>.* — the mockup's
 *  CP_SUGG, as data, so the suggestions can be translated. */
export const COPILOT_SUGGESTIONS: Record<CopilotContext, readonly string[]> = {
  dashboard: ["summary", "callFirst", "compareStock"],
  leads: ["whoToAssign", "draftEmail", "atRisk"],
  projects: ["incomplete", "draftDescription", "unitTypes"],
  news: ["ideas", "seoCheck", "translate"],
  seo: ["fixFirst", "rising", "redirects"],
  publishing: ["mostMissing", "translateFaq"],
  default: ["summary", "anomalies", "frequent"],
};
