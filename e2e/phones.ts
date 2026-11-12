/**
 * e2e/phones.ts
 * A fresh, ordinary-looking Thai mobile number for each enquiry a spec
 * sends. Two reasons it has to be fresh and ordinary: 0812345678 is now
 * held as a test number (lib/leads/spam-signals.ts), and the same number
 * three times in a day is held as a repeat sender.
 */

import { spamSignals } from "../lib/leads/spam-signals";

let counter = 0;

/** { typed: "08…", e164: "+668…" } */
export function uniqueThaiMobile(): { typed: string; e164: string } {
  for (;;) {
    counter += 1;
    const tail = String((Date.now() * 7 + counter * 7919 + Math.floor(Math.random() * 1e6)) % 1e7).padStart(7, "0");
    const typed = `081${tail}`;
    const e164 = `+66${typed.slice(1)}`;
    const signals = spamSignals({ name: "Somchai Prasert", email: "somchai.prasert@gmail.com", phone: e164 });
    if (!signals.some((signal) => signal.startsWith("phone_"))) {
      return { typed, e164 };
    }
  }
}
