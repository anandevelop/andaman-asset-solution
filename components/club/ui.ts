/**
 * components/club/ui.ts — shared class strings for the portal's buttons and
 * surfaces. Champagne metal on the dark card, ink black in light mode, as in
 * the mockup's `.lx-cta` / `.tm-l .lx-cta`.
 */

const focus = "outline-none focus-visible:ring-2 focus-visible:ring-club-accent focus-visible:ring-offset-2 focus-visible:ring-offset-club-bg";

export const btnPrimary = `flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-champagne-metal px-5 text-[14px] font-semibold tracking-[0.03em] text-ink-black shadow-[0_10px_24px_-12px_rgb(217_196_161/0.6),inset_0_1px_0_rgb(255_255_255/0.5)] transition-transform active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-45 [.club-light_&]:bg-none [.club-light_&]:bg-[#1d1d1f] [.club-light_&]:text-white [.club-light_&]:shadow-[0_10px_24px_-14px_rgb(0_0_0/0.6)] ${focus}`;

export const btnGhost = `flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-champagne-300/45 bg-transparent px-5 text-[13.5px] tracking-[0.02em] text-champagne-100 transition-colors hover:bg-white/5 disabled:opacity-45 [.club-light_&]:border-black/15 [.club-light_&]:bg-white [.club-light_&]:text-club-text ${focus}`;

export const btnSecondary = `flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-club-line bg-club-surface px-5 text-[14px] text-club-text transition-colors hover:bg-club-surface-2 ${focus}`;

export const linkText = `rounded text-club-accent underline underline-offset-[3px] ${focus}`;

export const surface = "rounded-[18px] border border-club-line bg-club-surface";

export const field =
  "min-h-12 w-full rounded-2xl border border-club-line bg-club-surface px-4 text-[16px] text-club-text placeholder:text-club-text-3 outline-none transition-colors focus:border-club-accent focus-visible:ring-2 focus-visible:ring-club-accent/40";

export const eyebrow = "text-[10px] tracking-[0.5em] text-champagne-700 [.club-light_&]:text-champagne-900";

export { focus as focusRing };
