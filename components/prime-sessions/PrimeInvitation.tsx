"use client";

/**
 * components/prime-sessions/PrimeInvitation.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * THE PRIME SESSIONS invitation, as the agency sees it: the card, then the
 * reply form, then an admission pass. One URL, three views — the reply is
 * a moment inside the invitation, not a separate page to navigate to.
 *
 * Ported from the HTML mockup the owner approved; the look lives in
 * prime-sessions.css (every rule scoped under .ps). Event facts and the
 * reply rules are in lib/prime-sessions.ts; the reply is saved by
 * /api/prime-sessions/rsvp.
 *
 * The countdown and "replies closed" are worked out after hydration: the
 * page is cached HTML, and the time it was rendered is not the time it is
 * read.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "./prime-sessions.css";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { siteConfig } from "@/config/site";
import { loadRecaptcha, useRecaptchaToken } from "@/components/RecaptchaProvider";
import {
  PRIME_SESSIONS,
  primeDaysToGo,
  primeRepliesOpen,
  type PrimeAttendance,
} from "@/lib/prime-sessions";

type View = "card" | "form" | "done";
type Field = "agency" | "contact" | "phone" | "status" | "consent";

const LOGO = "/images/prime-sessions/logo-ivory.png";
const LOGO_ALT = "The Residence Prime by Andaman Asset Solution";
const COUNTRY_CODES = [
  ["🇹🇭", "+66"],
  ["🇨🇳", "+86"],
  ["🇷🇺", "+7"],
  ["🇸🇬", "+65"],
  ["🇦🇺", "+61"],
  ["🇬🇧", "+44"],
  ["🇺🇸", "+1"],
] as const;

const STATUS_OPTIONS: { value: PrimeAttendance; key: "s1" | "s2" | "s3" }[] = [
  { value: "ATTENDING", key: "s1" },
  { value: "MAYBE", key: "s2" },
  { value: "DECLINED", key: "s3" },
];

/** Floating notes: symbol, x, size, duration, delay, colour. */
const NOTES = [
  ["n1", 6, 13, 5.2, 0, "#a8394d"],
  ["n2", 24, 17, 6.4, -1.6, "#cf7d8b"],
  ["n3", 44, 12, 4.8, -3.1, "#8f2c3e"],
  ["n1", 60, 15, 5.8, -0.8, "#cf7d8b"],
  ["n2", 78, 13, 6.8, -4.2, "#a8394d"],
  ["n3", 93, 11, 5.0, -2.4, "#cf7d8b"],
] as const;

function Notes({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? "notes notes-sm" : "notes"} aria-hidden="true">
      {NOTES.map(([symbol, x, size, duration, delay, colour], index) => (
        <svg
          key={index}
          style={
            {
              "--x": `${x}%`,
              "--s": `${size}px`,
              "--d": `${duration}s`,
              "--dl": `${delay}s`,
              color: colour,
            } as React.CSSProperties
          }
        >
          <use href={`#${symbol}`} />
        </svg>
      ))}
    </div>
  );
}

function NoteSymbols() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="n1" viewBox="0 0 16 24">
          <ellipse cx="5.2" cy="19" rx="4.2" ry="3" transform="rotate(-22 5.2 19)" fill="currentColor" />
          <rect x="8.1" y="2" width="1.3" height="17" fill="currentColor" />
          <path d="M9.4 2c.2 3.6 5.2 4.8 4.2 10-.6-2.8-2.4-4-4.2-4.3z" fill="currentColor" />
        </symbol>
        <symbol id="n2" viewBox="0 0 24 24">
          <ellipse cx="5" cy="19.5" rx="4" ry="2.9" transform="rotate(-22 5 19.5)" fill="currentColor" />
          <ellipse cx="17.5" cy="17.5" rx="4" ry="2.9" transform="rotate(-22 17.5 17.5)" fill="currentColor" />
          <rect x="7.8" y="4.6" width="1.3" height="15" fill="currentColor" />
          <rect x="20.3" y="2.6" width="1.3" height="15" fill="currentColor" />
          <path d="M7.8 4.6 21.6 2.6v3L7.8 7.6z" fill="currentColor" />
        </symbol>
        <symbol id="n3" viewBox="0 0 16 24">
          <ellipse cx="5.2" cy="19" rx="4.2" ry="3" transform="rotate(-22 5.2 19)" fill="currentColor" />
          <rect x="8.1" y="3" width="1.3" height="16" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}

type Reply = { agency: string; contact: string; attendance: PrimeAttendance; guests: number };

export default function PrimeInvitation({ locale }: { locale: string }) {
  const t = useTranslations("primeSessions");
  const getRecaptchaToken = useRecaptchaToken();

  const [view, setView] = useState<View>("card");
  // Unknown until mounted — see the header note.
  const [daysToGo, setDaysToGo] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  const [agency, setAgency] = useState("");
  const [contact, setContact] = useState("");
  const [countryCode, setCountryCode] = useState("+66");
  const [phone, setPhone] = useState("");
  const [attendance, setAttendance] = useState<PrimeAttendance | null>(null);
  const [guests, setGuests] = useState(1);
  const [dietary, setDietary] = useState("");
  const [consent, setConsent] = useState(false);
  const [bad, setBad] = useState<Set<Field>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [passKey, setPassKey] = useState(0);

  const agencyRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const dietRef = useRef<HTMLTextAreaElement>(null);

  /*
    iPhone and iPad Safari zoom in on any field under 16px when it is
    tapped, and stay zoomed. maximum-scale=1 stops that, and iOS still lets
    people pinch-zoom on their own. Only on iOS and only on this page: on
    Android the same setting would block pinch-zoom, and Android does not
    auto-zoom anyway. Put back on the way out.
  */
  useEffect(() => {
    const ios =
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!ios || !meta) return;
    const before = meta.content;
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
    return () => {
      meta.content = before;
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      setDaysToGo(primeDaysToGo());
      setOpen(primeRepliesOpen());
    };
    // A link sent as …/prime-sessions#form opens on the form.
    const openFromLink = () => {
      if (window.location.hash === "#form" && primeRepliesOpen()) setView("form");
    };
    tick();
    openFromLink();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function go(next: View) {
    setView(next);
    const url = window.location.pathname + window.location.search + (next === "card" ? "" : `#${next}`);
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
    if (next === "form") window.setTimeout(() => agencyRef.current?.focus({ preventScroll: true }), 60);
  }

  function clear(field: Field) {
    if (!bad.has(field)) return;
    const next = new Set(bad);
    next.delete(field);
    setBad(next);
  }

  const phoneOk = (value: string) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15 && /^[0-9()\-\s]+$/.test(value.trim());
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setError(null);

    const problems = new Set<Field>();
    if (!agency.trim()) problems.add("agency");
    if (!contact.trim()) problems.add("contact");
    if (!phoneOk(phone)) problems.add("phone");
    if (!attendance) problems.add("status");
    if (!consent) problems.add("consent");
    setBad(problems);
    if (problems.size > 0 || !attendance) {
      const first = problems.has("agency")
        ? agencyRef
        : problems.has("contact")
          ? contactRef
          : problems.has("phone")
            ? phoneRef
            : problems.has("status")
              ? statusRef
              : consentRef;
      first.current?.focus();
      return;
    }

    const form = event.currentTarget;
    const honeypot = new FormData(form).get("company");

    setSending(true);
    try {
      const recaptchaToken = await getRecaptchaToken("prime_rsvp");
      const response = await fetch("/api/prime-sessions/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyName: agency.trim(),
          name: contact.trim(),
          countryCode,
          phone: phone.trim(),
          attendance,
          guests: attendance === "DECLINED" ? 1 : guests,
          dietary: attendance === "DECLINED" ? "" : dietary.trim(),
          consentGiven: true,
          consentVersion: siteConfig.legal.consentVersion,
          recaptchaToken,
          locale,
          company: typeof honeypot === "string" ? honeypot : "",
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (response.ok && body?.ok) {
        setReply({
          agency: agency.trim(),
          contact: contact.trim(),
          attendance,
          guests: attendance === "DECLINED" ? 0 : guests,
        });
        setPassKey((key) => key + 1);
        go("done");
        return;
      }
      if (body?.error === "CLOSED") {
        setOpen(false);
        go("card");
        return;
      }
      setError(response.status === 429 ? t("errorRate") : t("errorGeneric"));
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  // The diet field grows with what is typed, one line at a time.
  useEffect(() => {
    const field = dietRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.max(42, field.scrollHeight)}px`;
  }, [dietary]);

  const declined = attendance === "DECLINED";
  const showSoon = open && daysToGo !== null;

  const passHead =
    reply?.attendance === "ATTENDING" ? t("headYes") : reply?.attendance === "MAYBE" ? t("headMaybe") : t("headNo");
  const passBody = reply
    ? reply.attendance === "ATTENDING"
      ? t("bodyYes", { name: reply.contact })
      : reply.attendance === "MAYBE"
        ? t("bodyMaybe", { name: reply.contact })
        : t("bodyNo")
    : "";
  const stub: [string, string][] = reply
    ? [
        [t("lDate"), t("stubDate")],
        [t("lTime"), t("stubTime")],
        reply.attendance === "DECLINED"
          ? [t("lStatus"), t("s3")]
          : [t("lGuests"), String(reply.guests).padStart(2, "0")],
      ]
    : [];

  return (
    <div className="ps" data-view={view} lang={locale}>
      <div className="backdrop" aria-hidden="true" />
      <NoteSymbols />

      <header className="top">
        {/* The way back to the card sits in the same row as the languages,
            both lined up with the panel's edges; the panel itself carries
            the event's name, so no logo is repeated up here. */}
        <button type="button" className="back" onClick={() => go("card")}>
          <span className="arr" aria-hidden="true">
            ←
          </span>{" "}
          <span>{t("backCard")}</span>
        </button>
        <nav className="lang" aria-label="Language">
          {LOCALE_DISPLAY_ORDER.map((code) => (
            <Link
              key={code}
              href={`/${code}/prime-sessions`}
              hrefLang={code}
              lang={code}
              replace
              scroll={false}
              aria-current={code === locale ? "page" : undefined}
              className="lang-btn"
            >
              {code.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>

      <div className="ps-main">
        {/* 1. The invitation card */}
        <section id="card" className="view" aria-labelledby="t-title">
          <div className="card card-wow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src={LOGO} alt={LOGO_ALT} width={1100} height={118} />
            <p className="kicker">{t("kicker")}</p>
            <h1 id="t-title" lang="en">
              THE PRIME SESSIONS
            </h1>
            <p className="sub" lang="en">
              Live Jazz, Wine &amp;
              <br />
              the Privilege Card Launch
            </p>
            <Notes />
            <div className="when">
              <span>{t("day")}</span>
              <span className="d">12</span>
              <span>{t("month")}</span>
            </div>
            <p className="time">{t("time")}</p>
            <p className="venue">@ The Residence Prime</p>
            <div className="brief">
              <p className="intro">{t("intro")}</p>
            </div>

            {open ? (
              <>
                {showSoon && (
                  <p className="soon">
                    <i />
                    <span>{daysToGo === 0 ? t("soonTonight") : t("soonDays", { days: daysToGo })}</span>
                  </p>
                )}
                <button
                  type="button"
                  className="cta cta-glow"
                  onClick={() => go("form")}
                  onPointerEnter={() => void loadRecaptcha()}
                >
                  <span>{t("reply")}</span> <span className="arr" aria-hidden="true">→</span>
                </button>
                <p className="small">
                  <span>{t("replyBy")}</span> <span className="dl">{t("deadline")}</span> ·{" "}
                  <span>{t("onePer")}</span>
                </p>
              </>
            ) : (
              <div className="closed" role="status">
                <p className="closed-title">{t("closedTitle")}</p>
                <p className="small">{t("closedBody")}</p>
              </div>
            )}
          </div>
        </section>

        {/* 2. The reply */}
        <section id="form" className="view" aria-labelledby="t-form">
          <div className="form-wrap">
            <div className="sheet">
              <div className="sh-head">
                <p className="sh-kick">R · S · V · P</p>
                <b className="sh-title">THE PRIME SESSIONS</b>
                <p className="sh-meta">
                  <span>{t("dateShort")}</span>
                  <i />
                  The Residence Prime
                </p>
                <Notes small />
                <h2 className="sh-h" id="t-form">
                  {t("reply")}
                </h2>
              </div>

              <form
                id="rsvp"
                noValidate
                onSubmit={submit}
                onFocusCapture={() => void loadRecaptcha()}
              >
                <div className={`f${bad.has("agency") ? " bad" : ""}`}>
                  <label className="lb" htmlFor="ps-agency">
                    {t("agency")} *
                  </label>
                  <input
                    ref={agencyRef}
                    className="in"
                    id="ps-agency"
                    name="agency"
                    autoComplete="organization"
                    maxLength={160}
                    value={agency}
                    aria-invalid={bad.has("agency") || undefined}
                    onChange={(e) => {
                      setAgency(e.target.value);
                      clear("agency");
                    }}
                  />
                  <p className="err">{t("required")}</p>
                </div>
                <div className={`f${bad.has("contact") ? " bad" : ""}`}>
                  <label className="lb" htmlFor="ps-contact">
                    {t("contact")} *
                  </label>
                  <input
                    ref={contactRef}
                    className="in"
                    id="ps-contact"
                    name="contact"
                    autoComplete="name"
                    maxLength={120}
                    value={contact}
                    aria-invalid={bad.has("contact") || undefined}
                    onChange={(e) => {
                      setContact(e.target.value);
                      clear("contact");
                    }}
                  />
                  <p className="err">{t("required")}</p>
                </div>
                <div className={`f${bad.has("phone") ? " bad" : ""}`}>
                  <label className="lb" htmlFor="ps-phone">
                    {t("phone")} *
                  </label>
                  <div className="phone">
                    <select
                      className="in"
                      aria-label="Country code"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      {COUNTRY_CODES.map(([flag, code]) => (
                        <option key={code} value={code}>
                          {flag} {code}
                        </option>
                      ))}
                    </select>
                    <input
                      ref={phoneRef}
                      className="in"
                      id="ps-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="81 234 5678"
                      maxLength={20}
                      value={phone}
                      aria-invalid={bad.has("phone") || undefined}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        clear("phone");
                      }}
                    />
                  </div>
                  <p className="err">{t("phoneErr")}</p>
                </div>
                <fieldset className={`f${bad.has("status") ? " bad" : ""}`} style={{ border: 0 }}>
                  <legend className="lb">{t("status")} *</legend>
                  <div className="seg">
                    {STATUS_OPTIONS.map((option, index) => (
                      <Fragment key={option.value}>
                        <input
                          ref={index === 0 ? statusRef : undefined}
                          type="radio"
                          name="status"
                          id={`ps-${option.key}`}
                          value={option.value}
                          checked={attendance === option.value}
                          onChange={() => {
                            setAttendance(option.value);
                            clear("status");
                          }}
                        />
                        <label htmlFor={`ps-${option.key}`}>{t(option.key)}</label>
                      </Fragment>
                    ))}
                  </div>
                  <p className="err">{t("pick")}</p>
                </fieldset>

                <div className="f inline" hidden={declined}>
                  <span className="lb" id="ps-gl">
                    {t("guests")} *<small>{t("guestsHint")}</small>
                  </span>
                  <div className="step" role="group" aria-labelledby="ps-gl">
                    <button
                      type="button"
                      aria-label="−1"
                      disabled={guests <= 1}
                      onClick={() => setGuests((n) => Math.max(1, n - 1))}
                    >
                      −
                    </button>
                    <output aria-live="polite">{guests}</output>
                    <button
                      type="button"
                      aria-label="+1"
                      disabled={guests >= PRIME_SESSIONS.maxGuests}
                      onClick={() => setGuests((n) => Math.min(PRIME_SESSIONS.maxGuests, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="f" hidden={declined}>
                  <label className="lb" htmlFor="ps-diet">
                    {t("diet")} <small>{t("optional")}</small>
                  </label>
                  <textarea
                    ref={dietRef}
                    className="in"
                    id="ps-diet"
                    name="diet"
                    maxLength={300}
                    rows={1}
                    value={dietary}
                    onChange={(e) => setDietary(e.target.value)}
                  />
                </div>

                <div className={`f${bad.has("consent") ? " bad" : ""}`}>
                  <label className="chk">
                    <input
                      ref={consentRef}
                      type="checkbox"
                      checked={consent}
                      aria-invalid={bad.has("consent") || undefined}
                      onChange={(e) => {
                        setConsent(e.target.checked);
                        clear("consent");
                      }}
                    />
                    <span>
                      {t("consent")}{" "}
                      <a
                        href={`/${locale}${siteConfig.legal.privacyPolicyPath}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {t("privacy")}
                      </a>{" "}
                      *
                    </span>
                  </label>
                  <p className="err">{t("consentErr")}</p>
                </div>

                {/* Honeypot — hidden from people; see lib/validations.ts honeypotValue. */}
                <div className="hp" aria-hidden="true">
                  <label htmlFor="ps-company">Company</label>
                  <input id="ps-company" type="text" tabIndex={-1} autoComplete="off" name="company" />
                </div>

                {error && (
                  <p className="send-err" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" className="cta submit cta-glow" disabled={sending} aria-busy={sending}>
                  <span>{sending ? t("sending") : t("send")}</span>{" "}
                  <span className="arr" aria-hidden="true">
                    →
                  </span>
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* 3. Thank you: an admission pass */}
        <section id="done" className="view" aria-live="polite">
          {reply && (
            <>
              <div key={passKey} className={`pass play${reply.attendance === "DECLINED" ? " is-no" : ""}`}>
                <div className="pass-top">
                  <svg className="seal" viewBox="0 0 120 120" aria-hidden="true">
                    <defs>
                      <path id="ps-ring" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
                    </defs>
                    <circle cx="60" cy="60" r="57" className="s-out" />
                    <circle cx="60" cy="60" r="34" className="s-in" />
                    <text className="s-txt">
                      <textPath href="#ps-ring" startOffset="0">
                        THE PRIME SESSIONS · 12 · XII · MMXXVI ·
                      </textPath>
                    </text>
                    <path className="s-tick" d="M47 61 l9 9 l18 -20" />
                  </svg>
                  <p className="pk">{reply.attendance === "DECLINED" ? t("kickNo") : t("kickYes")}</p>
                  <h2 className="ph">{passHead}</h2>
                  <p className="pa">{reply.agency}</p>
                  <p className="pb">{passBody}</p>
                </div>
                <div className="perf" aria-hidden="true" />
                <dl className="stub">
                  {stub.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="after">{t("change")}</p>
              <button type="button" className="ghost" onClick={() => go("card")}>
                ← <span>{t("backCard")}</span>
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
