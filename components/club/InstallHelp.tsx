"use client";
/**
 * components/club/InstallHelp.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "เพิ่ม Andaman ไว้ที่หน้าจอหลัก": the home-screen banner shown once after
 * the first remembered sign-in, and the how-to sheet (iPhone share sheet /
 * Android menu) it and Account → เพิ่มไอคอนบนหน้าจอหลัก open.
 *
 * The sheet is a native <dialog>: focus trap, Escape and the backdrop come
 * from the browser. Dismissing the banner writes club_a2hs=done so it
 * never comes back on this device; it also stays hidden when the portal
 * is already running from the home screen.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { AlertTriangle, ChevronRight, X } from "lucide-react";
import ClubLogo from "./ClubLogo";

export type InstallLabels = {
  title: string;
  lead: string;
  how: string;
  later: string;
  ios: [string, string, string];
  android: [string, string, string];
  lineTip: string;
  done: string;
  iphone: string;
  android_: string;
  close: string;
};

function AppIcon({ size = 44 }: { size?: number }) {
  return (
    <span
      className="bg-black-card grid shrink-0 place-items-center shadow-[inset_0_0_0_0.5px_rgb(217_196_161/0.45)]"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
      aria-hidden
    >
      <ClubLogo className="w-[78%]" />
    </span>
  );
}

const subscribeNone = () => () => {};
const isAndroid = () => /Android/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function Sheet({ dialog, labels }: { dialog: RefObject<HTMLDialogElement | null>; labels: InstallLabels }) {
  const android = useSyncExternalStore(subscribeNone, isAndroid, () => false);
  const [os, setOs] = useState<"ios" | "android" | null>(null);
  const current = os ?? (android ? "android" : "ios");
  const steps = current === "ios" ? labels.ios : labels.android;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="club-a2hs-title"
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:mx-auto sm:max-w-md"
    >
      <div className="mx-auto max-w-md rounded-t-[26px] border border-club-line bg-club-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 text-club-text">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-club-line" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <h2 id="club-a2hs-title" className="text-[17px] font-semibold">{labels.title}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={labels.close}
            className="-mr-2 -mt-1 grid size-11 place-items-center rounded-full text-club-text-2 outline-none focus-visible:ring-2 focus-visible:ring-club-accent"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div role="tablist" className="mt-4 grid grid-cols-2 rounded-full bg-club-surface-2 p-1 text-[13px]">
          {(["ios", "android"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={current === key}
              onClick={() => setOs(key)}
              className={`min-h-10 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-club-accent ${current === key ? "bg-club-surface font-semibold text-club-text shadow-sm" : "text-club-text-2"}`}
            >
              {key === "ios" ? labels.iphone : labels.android_}
            </button>
          ))}
        </div>
        <ol className="mt-4 space-y-3" role="tabpanel">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-[13.5px] leading-snug">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-champagne-metal text-[12px] font-semibold text-ink-black">{i + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {current === "ios" ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-club-surface-2 px-3 py-2.5 text-[12px] text-club-text-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            {labels.lineTip}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="mt-5 min-h-12 w-full rounded-full bg-champagne-metal text-[14px] font-semibold text-ink-black outline-none focus-visible:ring-2 focus-visible:ring-club-accent focus-visible:ring-offset-2 focus-visible:ring-offset-club-surface"
        >
          {labels.done}
        </button>
      </div>
    </dialog>
  );
}

/** A row or button anywhere that opens the how-to sheet. */
export function InstallHelpTrigger({ labels, children, className = "" }: { labels: InstallLabels; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={className}>
        {children}
      </button>
      <Sheet dialog={dialog} labels={labels} />
    </>
  );
}

/** The dismissable banner on Home. */
export default function InstallBanner({ labels }: { labels: InstallLabels }) {
  const standalone = useSyncExternalStore(subscribeNone, isStandalone, () => false);
  const [hidden, setHidden] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  if (hidden || standalone) return null;

  const dismiss = () => {
    document.cookie = "club_a2hs=done; path=/; max-age=31536000; samesite=lax";
    setHidden(true);
  };

  return (
    <section className="mb-6 flex gap-3 rounded-[20px] border border-club-line bg-club-surface p-3.5" aria-labelledby="club-a2hs-banner">
      <AppIcon />
      <div className="min-w-0 flex-1">
        <h2 id="club-a2hs-banner" className="text-[13.5px] font-semibold text-club-text">{labels.title}</h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-club-text-2">{labels.lead}</p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            className="flex min-h-11 items-center gap-1 rounded-full bg-champagne-metal px-4 text-[12.5px] font-semibold text-ink-black outline-none focus-visible:ring-2 focus-visible:ring-club-accent"
          >
            {labels.how}
            <ChevronRight size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 rounded-full px-4 text-[12.5px] text-club-text-2 outline-none focus-visible:ring-2 focus-visible:ring-club-accent"
          >
            {labels.later}
          </button>
        </div>
      </div>
      <Sheet dialog={dialog} labels={labels} />
    </section>
  );
}
