/**
 * lib/admin/keyboard.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The back office's single-key shortcuts (`[` for the rail, and the rest
 * that follow) share one rule: they never fire while somebody is typing.
 * "[" is a character people put in slugs and notes, and a shortcut that
 * collapsed the sidebar mid-sentence would be a bug report within the day.
 * ─────────────────────────────────────────────────────────────────────────
 */

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
