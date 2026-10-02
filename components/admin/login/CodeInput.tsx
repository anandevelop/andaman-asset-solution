"use client";

/**
 * components/admin/login/CodeInput.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The second factor as six boxes — drawn over ONE real input.
 *
 * Six separate inputs would look the same and break three things that
 * already work: one-time-code autofill (iOS SMS, password managers) fills
 * a single field; a recovery code goes in the same place as the six
 * digits; and the e2e suite finds and fills "Authentication code" as one
 * field. So the input is real, labelled, focusable and stretched over the
 * boxes at opacity 0 — a click on any box lands in it — and the boxes are
 * only a picture of its value.
 *
 * A pasted or typed value with a letter in it is a recovery code: the
 * component switches to recovery mode (a plain, visible text field with
 * the same id and label) and passes the value along, with the dash put
 * back after the fifth character. The server's normaliseRecoveryCode()
 * accepts it with or without.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { RefObject } from "react";
import { useState } from "react";

export type CodeMode = "totp" | "recovery";
export type CodeState = "idle" | "error" | "locked" | "success";

/** "A3F9K2QMXP" → "A3F9K-2QMXP", for display while typing. */
export function formatRecovery(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/**
 * What a typed or pasted value becomes: digits only, at most six, in the
 * authenticator mode — unless it has a letter in it, which makes it a
 * recovery code. Shared by the field and the "paste" button.
 */
export function acceptCode(raw: string, mode: CodeMode): { mode: CodeMode; value: string } {
  if (mode === "recovery" || /[a-z]/i.test(raw)) return { mode: "recovery", value: formatRecovery(raw) };
  return { mode: "totp", value: raw.replace(/\D/g, "").slice(0, 6) };
}

export default function CodeInput({
  value,
  onChange,
  mode,
  onModeChange,
  state,
  inputRef,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: CodeMode;
  onModeChange: (mode: CodeMode) => void;
  state: CodeState;
  inputRef: RefObject<HTMLInputElement | null>;
  /** "Authentication code" — the sr-only label the e2e suite finds it by. */
  label: string;
}) {
  const [focused, setFocused] = useState(false);

  const take = (raw: string) => {
    const next = acceptCode(raw, mode);
    if (next.mode !== mode) onModeChange(next.mode);
    onChange(next.value);
  };

  if (mode === "recovery") {
    return (
      <div>
        <label htmlFor="totp" className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id="totp"
          name="totp"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={11}
          value={value}
          onChange={(event) => take(event.target.value)}
          placeholder="A3F9K-2QMXP"
          disabled={state === "locked"}
          className={[
            "h-[52px] w-full rounded-xl border-[1.5px] bg-surface-raised px-4 text-center font-mono text-lg uppercase tracking-[.14em] text-ink outline-none transition-[border-color,box-shadow] focus:border-primary-500 focus:shadow-[0_0_0_4px_rgba(41,102,130,.22)] disabled:opacity-45",
            state === "error" ? "border-[#b3261e]" : "border-[rgba(41,102,130,.35)]",
          ].join(" ")}
        />
      </div>
    );
  }

  return (
    <div className={`group relative ${state === "locked" ? "pointer-events-none opacity-45" : ""}`}>
      <label htmlFor="totp" className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id="totp"
        name="totp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={11}
        value={value}
        onChange={(event) => take(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={state === "locked"}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 caret-transparent"
      />
      <div aria-hidden className="flex justify-between gap-1.5 sm:gap-2">
        {Array.from({ length: 6 }, (_, index) => {
          const char = value[index] ?? "";
          const current = focused && index === Math.min(value.length, 5);
          return (
            <span
              key={index}
              className={[
                "grid aspect-[3/4] max-w-[52px] flex-1 place-items-center rounded-xl border-[1.5px] font-mono text-[21px] font-medium text-ink transition-[border-color,box-shadow,background-color] sm:text-2xl",
                state === "success"
                  ? "border-[#17663f] bg-[#e6f4ec] text-[#17663f]"
                  : state === "error"
                    ? "border-[#b3261e] bg-surface-raised"
                    : current
                      ? "border-primary-500 bg-[rgba(41,102,130,.04)] shadow-[0_0_0_4px_rgba(41,102,130,.22)]"
                      : char
                        ? "login-pop border-primary-500 bg-surface-raised"
                        : "border-[rgba(41,102,130,.35)] bg-surface-raised group-hover:border-[#7099af]",
              ].join(" ")}
            >
              {char}
            </span>
          );
        })}
      </div>
    </div>
  );
}
