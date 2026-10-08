"use client";
/**
 * components/club/OfflineBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * What the portal says when the phone has no network.
 *
 *   auth   OTP / house code: the first verification needs the internet.
 *   card   the card page, served by public/club-sw.js from the device:
 *          when it was last synced and how many of the 7 offline days are
 *          left, plus the green "the card still works" note.
 *   page   any other signed-in page: the data may not be the latest.
 *
 * While online, the card variant stamps the sync time in localStorage —
 * that stamp is the "อัปเดตล่าสุด" shown later offline.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useSyncExternalStore } from "react";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { OFFLINE_CARD_DAYS } from "@/lib/club/constants";
import { useOnline } from "./useOnline";
import { TIME_ZONE, formatDate } from "./format";

const SYNC_KEY = "club_card_synced";
const DAY = 86_400_000;

type Labels = { title: string; sub: string; cardOk: string; cardOkSub: string; local: string; expired: string; firstNeedsNet: string };

/**
 * "<synced ms>|<offline days left>" — a string so the snapshot stays equal
 * between renders on the same day (useSyncExternalStore compares with ===).
 */
function readSync(): string {
  let synced = 0;
  try {
    synced = Number(window.localStorage.getItem(SYNC_KEY)) || 0;
  } catch {
    /* storage blocked */
  }
  const left = synced ? Math.max(0, OFFLINE_CARD_DAYS - Math.floor((Date.now() - synced) / DAY)) : OFFLINE_CARD_DAYS;
  return `${synced}|${left}`;
}
const noSubscribe = () => () => {};

export default function OfflineBanner({ variant, locale, labels }: { variant: "auth" | "card" | "page"; locale: string; labels: Labels }) {
  const online = useOnline();
  const [syncedRaw, leftRaw] = useSyncExternalStore(noSubscribe, readSync, () => "0|0").split("|");

  useEffect(() => {
    if (!online || variant !== "card") return;
    try {
      window.localStorage.setItem(SYNC_KEY, String(Date.now()));
    } catch {
      /* private mode — the banner simply shows no time */
    }
  }, [online, variant]);

  if (online) return null;

  if (variant === "auth") {
    return (
      <div role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-champagne-500/40 bg-champagne-50 px-3.5 py-3 text-[12.5px] text-champagne-900">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
        {labels.firstNeedsNet}
      </div>
    );
  }

  const synced = Number(syncedRaw);
  const left = Number(leftRaw);
  const when = synced
    ? `${formatDate(new Date(synced), locale)} ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(synced))}`
    : "—";

  return (
    <div role="status" className="mb-3 space-y-2">
      <div className="flex items-start gap-2.5 rounded-2xl border border-club-line bg-club-surface px-3.5 py-3 text-club-text">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-club-accent" aria-hidden />
        <span className="min-w-0">
          <b className="block text-[12.5px] font-semibold">{labels.title}</b>
          <small className="block text-[11px] leading-snug text-club-text-2">
            {left > 0 ? labels.sub.replace("{t}", when).replace("{n}", String(left)) : labels.expired}
          </small>
        </span>
      </div>
      {variant === "card" && left > 0 ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-verify-ok/30 bg-verify-ok/10 px-3.5 py-3 text-[11.5px] leading-snug text-club-text-2">
          <Check size={14} className="mt-0.5 shrink-0 text-verify-ok" aria-hidden />
          <span>
            <b className="block text-[12.5px] font-semibold text-club-text">{labels.cardOk}</b>
            {labels.cardOkSub}
          </span>
        </div>
      ) : null}
      {variant === "page" ? <p className="px-1 text-[11px] text-club-text-3">{labels.local}</p> : null}
    </div>
  );
}
