/**
 * lib/leads/spam-signals.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What an enquiry typed to try the form out looks like: "test" in the
 * name, asdf on the keyboard, test@test.com, 0812345678, 0998877665.
 *
 * Only a signal, never a verdict. A flagged enquiry is held for an admin
 * (lib/leads/suspect.ts) rather than dropped, because each rule here has a
 * real person somewhere it is wrong about — a surname that is a word, a
 * number somebody paid extra for because the digits run in order.
 *
 * STRONG AND WEAK
 *
 * A strong signal flags on its own: nobody's name is "asdf". A weak one
 * ("hi" as the message, a mistyped gmail.com) is how plenty of real
 * enquiries look, so it only counts alongside a strong one, and is listed
 * then so the reviewer sees the whole picture.
 *
 * Pure, so the tests can run every rule directly.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const STRONG_SIGNALS = [
  "name_test",
  "name_mash",
  "name_placeholder",
  "email_test",
  "email_placeholder",
  "phone_sequence",
  "phone_repeat",
  "phone_pattern",
  "repeat_submit",
] as const;

export const WEAK_SIGNALS = ["message_test", "email_typo"] as const;

export type SpamSignal = (typeof STRONG_SIGNALS)[number] | (typeof WEAK_SIGNALS)[number];

export type SpamInput = {
  name: string;
  email: string;
  /** E.164, as the form sends it: "+66812345678". */
  phone: string;
  message?: string | null;
  /** Other enquiries from the same email or phone in the last day. */
  recentSubmissions?: number;
};

const TEST_WORD = /(?:^|[^a-z])(?:test|tester|testing|tset|demo|sample|dummy|fake|spam|lorem|ipsum)(?:[^a-z]|$)/i;
const THAI_TEST = /ทดสอบ|ลองระบบ|ลองส่ง|^เทส[\sๆ]*$|^เทสๆ|^เทส\s/;
/* Runs across the keyboard rows, Latin and the Thai Kedmanee layout
   (ฟหกด is "asdf" typed with the keyboard left on Thai). */
const MASH = /asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm|ฟหกด|หกดเ|กดเ้|ๆไำพ|ไำพะ|ผปแอ/i;
const PLACEHOLDER_NAMES = [
  "john doe",
  "jane doe",
  "john smith",
  "foo bar",
  "foo",
  "bar",
  "admin",
  "user",
  "username",
  "name",
  "name surname",
  "first last",
  "firstname lastname",
  "no name",
  "nobody",
  "anonymous",
  "xxx",
  "abc",
  "ชื่อ",
  "ชื่อ นามสกุล",
  "นาย ก",
  "นาย ข",
  "นายก ข",
];

const EMAIL_WORDS = ["test", "tset", "demo", "asdf", "qwer", "fake", "spam", "dummy", "sample", "lorem"];
const EMAIL_EXACT_LOCAL = ["noreply", "no-reply", "example", "abc", "xxx", "aaa", "a", "aa", "123", "1234", "email", "mail", "user", "name"];
const PLACEHOLDER_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.test",
  "test.co",
  "testing.com",
  "abc.com",
  "a.com",
  "aa.com",
  "aaa.com",
  "xxx.com",
  "domain.com",
  "email.com",
  "mail.test",
  "localhost",
];
const TYPO_DOMAINS = [
  "gmial.com",
  "gmai.com",
  "gamil.com",
  "gnail.com",
  "gmail.co",
  "gmail.con",
  "gmail.cm",
  "gmail.om",
  "gmaill.com",
  "hotmial.com",
  "hotmai.com",
  "hotmail.co",
  "yahooo.com",
  "yaho.com",
  "outlok.com",
  "outlook.co",
  "iclod.com",
];

const TEST_MESSAGE = /^(?:test(?:ing)?|tset|ทดสอบ|เทส+|ลอง(?:ส่ง|ระบบ)?|hello|hi|hey|123+|1234\d*|asdf\w*|ok|okay|aaa+|xxx+|[.\-_ ]+)$/i;

function nameSignals(raw: string): SpamSignal[] {
  const name = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const out: SpamSignal[] = [];
  if (TEST_WORD.test(name) || THAI_TEST.test(name)) out.push("name_test");
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (
    MASH.test(name.replace(/\s/g, "")) ||
    /^(.)\1{2,}$/u.test(letters) || // "aaa", "กกก"
    letters.length === 0 // digits or punctuation only
  ) {
    out.push("name_mash");
  }
  if (PLACEHOLDER_NAMES.includes(name)) out.push("name_placeholder");
  return out;
}

function emailSignals(raw: string): SpamSignal[] {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return [];
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const out: SpamSignal[] = [];

  // Words as tokens of the local part, so "contest@" and "latest@" pass and
  // "nikolai.tester79@" does not.
  const tokens = local.split(/[._\-+0-9]+/).filter(Boolean);
  if (tokens.some((token) => EMAIL_WORDS.some((word) => token.startsWith(word))) || MASH.test(local)) {
    out.push("email_test");
  }
  if (
    PLACEHOLDER_DOMAINS.includes(domain) ||
    EMAIL_EXACT_LOCAL.includes(local) ||
    /^(.)\1+$/.test(local) // "aaaa@", "1111@"
  ) {
    out.push("email_placeholder");
  }
  if (TYPO_DOMAINS.includes(domain)) out.push("email_typo");
  return out;
}

/** The subscriber number: the digits after the calling code, at most the last 9. */
function nationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // +66 numbers are 9 digits after the code; elsewhere the last 8 carry
  // the pattern as well as anything does.
  if (digits.startsWith("66") && digits.length === 11) return digits.slice(2);
  return digits.slice(-8);
}

/** The longest run of digits each one more (or each one less) than the last. */
function longestStep(digits: string): number {
  let best = 1;
  for (const step of [1, -1]) {
    let run = 1;
    for (let i = 1; i < digits.length; i += 1) {
      run = Number(digits[i]) - Number(digits[i - 1]) === step ? run + 1 : 1;
      best = Math.max(best, run);
    }
  }
  return best;
}

function phoneSignals(phone: string): SpamSignal[] {
  const digits = nationalDigits(phone);
  if (digits.length < 7) return [];
  // The tail, where a made-up number gives itself away: Thai mobiles start
  // 06/08/09 and the first digit or two after that are real prefixes.
  const tail = digits.slice(-8);
  const out: SpamSignal[] = [];

  if (longestStep(tail) >= 6) out.push("phone_sequence");

  const counts = new Map<string, number>();
  for (const d of tail) counts.set(d, (counts.get(d) ?? 0) + 1);
  if (Math.max(...counts.values()) >= 7) out.push("phone_repeat");

  // 99887766, 11223344: four pairs, each one apart — anywhere in the
  // number (0998877665 has its pairs one digit in from the end).
  const isPairsStep = (w: string) => {
    if (!/^(\d)\1(\d)\2(\d)\3(\d)\4$/.test(w)) return false;
    const values = [w[0], w[2], w[4], w[6]].map(Number);
    const step = values[1] - values[0];
    return Math.abs(step) === 1 && values.every((v, i) => i === 0 || v - values[i - 1] === step);
  };
  let pairsStep = false;
  for (let i = 0; i + 8 <= digits.length; i += 1) if (isPairsStep(digits.slice(i, i + 8))) pairsStep = true;
  const chunkRepeat = /^(\d{2})\1{3}$/.test(tail) || /^(\d{4})\1$/.test(tail) || /^(\d{3})\1\1/.test(digits.slice(-9));
  if (pairsStep || chunkRepeat) out.push("phone_pattern");

  return out;
}

/**
 * Every signal the enquiry shows, strong ones first. Empty means it looks
 * like an ordinary enquiry; see `isSuspect` for when it should be held.
 */
export function spamSignals(input: SpamInput): SpamSignal[] {
  const found = new Set<SpamSignal>([
    ...nameSignals(input.name),
    ...emailSignals(input.email),
    ...phoneSignals(input.phone),
  ]);
  if ((input.recentSubmissions ?? 0) >= 2) found.add("repeat_submit");
  if (input.message && TEST_MESSAGE.test(input.message.trim())) found.add("message_test");

  const order = [...STRONG_SIGNALS, ...WEAK_SIGNALS] as readonly SpamSignal[];
  return [...found].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Held for review when at least one strong signal is present. */
export function isSuspect(signals: readonly SpamSignal[]): boolean {
  return signals.some((signal) => (STRONG_SIGNALS as readonly string[]).includes(signal));
}
