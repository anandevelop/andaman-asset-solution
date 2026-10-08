"use client";
/**
 * components/club/FlipCard.tsx — the card on the Card tab. Front: the QR a
 * shop scans. Tap (or Enter/Space) turns it to the back: name, house,
 * card number. The back's "เงื่อนไข" link sits outside the flip button —
 * a link inside a button is not valid HTML — and only shows when flipped.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";

type Props = {
  front: ReactNode;
  back: ReactNode;
  termsHref: string;
  labels: { tapFront: string; tapBack: string; terms: string };
};

export default function FlipCard({ front, back, termsHref, labels }: Props) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div>
      <div className="relative [perspective:1400px]">
        <button
          type="button"
          aria-pressed={flipped}
          aria-label={flipped ? labels.tapBack : labels.tapFront}
          onClick={() => setFlipped((v) => !v)}
          className="block w-full rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-club-accent focus-visible:ring-offset-2 focus-visible:ring-offset-club-bg"
        >
          <span
            className={`relative block aspect-[1.586/1] w-full transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] [transform-style:preserve-3d] motion-reduce:duration-0 ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <span className="absolute inset-0 [backface-visibility:hidden]" aria-hidden={flipped}>
              {front}
            </span>
            <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden={!flipped}>
              {back}
            </span>
          </span>
        </button>
        {flipped ? (
          <Link
            href={termsHref}
            className="absolute right-[5%] top-[7%] z-10 flex min-h-11 items-center rounded-full px-3 text-[11px] tracking-[0.08em] text-champagne-100 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-club-accent"
          >
            {labels.terms}
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-center text-[11px] text-club-text-3" aria-live="polite">
        {flipped ? labels.tapFront : labels.tapBack}
      </p>
    </div>
  );
}
