/**
 * @vitest-environment jsdom
 *
 * This file renders React, so it needs a DOM. Vitest 4 removed
 * `environmentMatchGlobs` from vitest.config.ts; the docblock is the
 * replacement, and it has to be the first thing in the file.
 */
/**
 * tests/components/LeadForm.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The lead form is the site's only conversion. Everything else — the
 * photography, the ISR windows, the sitemap — exists to deliver someone to
 * this component, so a silent regression here costs more than a bug
 * anywhere else in the codebase.
 *
 * The tests are written against what a visitor experiences, not against
 * implementation: labels, roles and messages, never class names or state
 * variables. That is not purity for its own sake — it means a refactor of
 * the internals does not produce a wall of red, and a change to what the
 * user sees does.
 *
 * Three things are stubbed, all of them boundaries rather than logic:
 *
 *   fetch          the network. Each test decides what the server said.
 *   trackLead      GA4/Meta. Asserted on, because firing a conversion for
 *                  a submission that failed is a reporting lie.
 *   scrollIntoView jsdom has no layout engine.
 *
 * reCAPTCHA needs no stub. NEXT_PUBLIC_RECAPTCHA_SITE_KEY is unset in the
 * runner, so the provider renders null and the hook returns null — the same
 * path a production deploy takes when the key is not configured.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so its factory cannot close over a
// normal const — that would be a TDZ error at module evaluation. vi.hoisted
// lifts the spy with it.
const { trackLead } = vi.hoisted(() => ({ trackLead: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  trackLead,
  trackEvent: vi.fn(),
  trackLineClick: vi.fn(),
  trackWhatsappClick: vi.fn(),
  trackRsvp: vi.fn(),
  trackPageView: vi.fn(),
}));

// next/navigation is imported transitively by nothing in this tree today,
// but RecaptchaProvider's next/script is — and next/script outside an app
// router render tree logs noisily. Rendered as a plain script tag instead.
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script {...props} />,
}));

import LeadForm from "@/components/LeadForm";
import { render, screen, userEvent, waitFor, waitForElementToBeRemoved, within } from "./render";

/** Fill every required field with something valid. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), "Somchai Prasert");
  await user.type(screen.getByLabelText(/phone number/i), "0812345678");
  await user.type(screen.getByLabelText(/email address/i), "somchai@example.com");
  await user.click(screen.getByRole("checkbox"));
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input.toString();
}

/**
 * Stubs global fetch, routed by URL. /api/validate-email always resolves
 * to {status:"unknown"} — renders nothing, blocks nothing, see
 * components/LeadForm.tsx's own checkEmail — unless a test overrides it
 * via `emailCheck`, so a test that isn't specifically about the inline
 * email check never has to think about that second request at all.
 */
function mockFetch(
  response: Partial<Response> & { json?: () => Promise<unknown> },
  emailCheck?: Partial<Response> & { json?: () => Promise<unknown> },
) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (requestUrl(input) === "/api/validate-email") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: "unknown" }),
        ...emailCheck,
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      ...response,
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The lead-submission request specifically. The email field's own inline
 *  check (see mockFetch above) also calls fetch, on blur — which
 *  fillValidForm's own click on the consent checkbox triggers — so
 *  fetchMock.mock.calls[0] is no longer reliably /api/leads. */
function leadsCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit & { body: string }] {
  const call = fetchMock.mock.calls.find((call: unknown[]) => requestUrl(call[0] as RequestInfo | URL) === "/api/leads");
  if (!call) throw new Error("No /api/leads request was made");
  return call as [string, RequestInit & { body: string }];
}

function wasLeadsCallMade(fetchMock: ReturnType<typeof vi.fn>): boolean {
  return fetchMock.mock.calls.some((call: unknown[]) => requestUrl(call[0] as RequestInfo | URL) === "/api/leads");
}

beforeEach(() => {
  trackLead.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────
// RENDERING & ACCESSIBILITY
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — structure", () => {
  it("labels every control", () => {
    render(<LeadForm />);

    // getByLabelText throws if the association is missing, so these four
    // assertions are also the accessible-name test.
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nationality/i)).toBeInTheDocument();
  });

  it("marks the required fields as required to assistive tech", () => {
    render(<LeadForm />);

    for (const label of [/full name/i, /phone number/i, /email address/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-required", "true");
    }

    // Nationality is genuinely optional and must not claim otherwise.
    expect(screen.getByLabelText(/nationality/i)).not.toHaveAttribute("aria-required");
  });

  it("exposes a live region before anything happens to announce", () => {
    // The region has to be in the DOM ahead of the mutation. A status
    // element that appears together with its own text is never announced —
    // this is the assertion that stops that regression coming back.
    render(<LeadForm />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();
  });

  it("hides the honeypot from assistive tech and the tab order", () => {
    const { container } = render(<LeadForm />);
    const honeypot = container.querySelector('input[name="company"]');

    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
  });

  it("renders the consent notice with the policy version interpolated", () => {
    render(<LeadForm />);

    // The version is a legal record. A raw "{version}" on the page would
    // mean the consent trail says nothing.
    expect(screen.getByText(/policy privacy-policy-v/i)).toBeInTheDocument();
  });

  it("carries the project slug through as a hidden field", () => {
    const { container } = render(<LeadForm projectSlug="trinity-village" />);

    expect(container.querySelector('input[name="projectSlug"]')).toHaveValue(
      "trinity-village",
    );
  });

  it("renders Thai copy under the Thai locale", () => {
    render(<LeadForm />, { locale: "th" });

    expect(screen.getByLabelText("ชื่อ-นามสกุล")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ส่งคำขอนัดชม" })).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE VALIDATION
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — validation", () => {
  it("does not post an empty form", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await screen.findAllByRole("alert");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports each invalid field in its own alert", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const alerts = await screen.findAllByRole("alert");
    const messages = alerts.map((node) => node.textContent);

    expect(messages).toContain("Name is too short");
    expect(messages).toContain("Enter a valid email address");
    // The default country (TH) is selected but no digits were typed, so
    // toE164() has nothing to assemble — leadInquirySchema's PHONE_INVALID
    // sentinel maps to this translated sentence in LeadForm's own render;
    // see its phoneError computation.
    expect(messages).toContain("Enter a valid phone number for the country you selected");
  });

  it("points the invalid input at its own error message", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/email address/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const email = await screen.findByLabelText(/email address/i);
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));

    // The described-by target must exist, or a screen reader announces
    // "invalid" and then nothing about why.
    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy).toBe("email-error");
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Enter a valid email address",
    );
  });

  it("refuses to submit without consent", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/full name/i), "Somchai Prasert");
    await user.type(screen.getByLabelText(/phone number/i), "0812345678");
    await user.type(screen.getByLabelText(/email address/i), "somchai@example.com");
    // Consent box deliberately left unticked.
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    expect(
      await screen.findByText("Consent is required to submit this form"),
    ).toBeInTheDocument();
    // The email field's own inline check still fires on blur regardless
    // — it is not this test's concern. What matters here is that the
    // enquiry itself was never posted.
    expect(wasLeadsCallMade(fetchMock)).toBe(false);
  });

  it("clears the error once the field is corrected", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/full name/i), "A");
    await user.click(screen.getByRole("button", { name: /request viewing/i }));
    expect(await screen.findByText("Name is too short")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/full name/i), "nan Wattana");

    await waitFor(() =>
      expect(screen.queryByText("Name is too short")).not.toBeInTheDocument(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SUBMISSION
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — submission", () => {
  it("posts the enquiry and confirms it", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm projectSlug="trinity-village" source="PROJECT_PAGE" />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    // Two requests now, not one — the email field's own inline check
    // (fired on blur, which fillValidForm's click on the checkbox
    // triggers) and the actual submission. leadsCall finds the one this
    // test cares about regardless of which fired first.
    await waitFor(() => expect(wasLeadsCallMade(fetchMock)).toBe(true));

    const [url, init] = leadsCall(fetchMock);
    expect(url).toBe("/api/leads");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      name: "Somchai Prasert",
      email: "somchai@example.com",
      // Assembled to E.164 against the default TH country — fillValidForm
      // types the bare national number, exactly what a visitor who never
      // touches the country dropdown does.
      phone: "+66812345678",
      phoneCountry: "TH",
      consentGiven: true,
      projectSlug: "trinity-village",
      source: "PROJECT_PAGE",
    });
    // The PDPA trail: the version consented to must ride along with the
    // consent itself, not be inferred later from the row's timestamp.
    expect(body.consentVersion).toMatch(/^privacy-policy-v/);

    // The confirmation is a dialog now, not an inline message — see
    // components/LeadSuccessDialog.tsx.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Thank you")).toBeInTheDocument();
  });

  it("attaches UTM attribution from the landing URL", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    window.history.replaceState(
      {},
      "",
      "/en/projects/trinity-village?utm_source=google&utm_medium=cpc&utm_campaign=phuket-villas",
    );

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(JSON.parse(leadsCall(fetchMock)[1].body)).toMatchObject({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "phuket-villas",
    });

    window.history.replaceState({}, "", "/");
  });

  it("sends empty UTM fields when there are none", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(leadsCall(fetchMock)[1].body);
    expect(body.utmSource).toBe("");
  });

  it("fires the conversion event only after the server confirms", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm source="CONTACT_PAGE" />);
    await fillValidForm(user);

    expect(trackLead).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(trackLead).toHaveBeenCalledTimes(1));
    expect(trackLead).toHaveBeenCalledWith({
      source: "CONTACT_PAGE",
      projectSlug: undefined,
    });
  });

  it("keeps the form's values behind the dialog, and clears them only once it closes", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm projectSlug="trinity-village" />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const dialog = await screen.findByRole("dialog");

    // Values survive behind the open dialog. A visitor who glances past
    // its edge and sees the form already blank cannot tell whether the
    // submission actually went through — the obvious response, pressing
    // submit again, files a duplicate lead the sales team then calls
    // twice.
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Somchai Prasert");
    expect(screen.getByLabelText(/email address/i)).toHaveValue("somchai@example.com");

    await user.click(within(dialog).getByRole("button", { name: /^close$/i }));

    // waitFor, not a bare assertion: the dialog's own exit animation and
    // the reset are two separate renders.
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue(""));
    expect(screen.getByLabelText(/email address/i)).toHaveValue("");
    // …but the slug survives the reset, or a second enquiry from the same
    // page would arrive unattributed.
    expect(
      document.querySelector('input[name="projectSlug"]'),
    ).toHaveValue("trinity-village");
  });

  it("closes the dialog and returns focus to the submit button on Escape", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    const submitButton = screen.getByRole("button", { name: /request viewing/i });
    await user.click(submitButton);

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(submitButton).toHaveFocus();
  });

  it("disables the submit button while in flight", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        pending.then(() => ({ ok: true, status: 200, json: async () => ({}) })),
      ),
    );

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    // Double-submit protection. Without it an impatient click on a slow
    // connection creates two identical leads and the sales team calls the
    // same person twice.
    const button = await screen.findByRole("button", { name: /sending/i });
    expect(button).toBeDisabled();

    release(undefined);
    await screen.findByRole("dialog");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// COUNTRY PICKERS
//
// Both fields render the same CountrySelect combobox (see
// components/CountrySelect.tsx) — role="combobox" sits on the closed
// trigger button rather than the search input, a deliberate deviation from
// the textbook ARIA pattern explained in that file's own header.
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — country pickers", () => {
  it("assembles E.164 against a country other than the default", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/full name/i), "Somchai Prasert");
    await user.type(screen.getByLabelText(/email address/i), "somchai@example.com");

    // "Country code", not the "+66" it visibly shows: role="combobox" is
    // not a name-from-content role, so the trigger needs (and gets) an
    // explicit aria-label — see CountrySelect's own prop comment.
    await user.click(screen.getByRole("combobox", { name: /country code/i }));
    await user.type(screen.getByPlaceholderText(/search country or code/i), "United Kingdom");
    await user.click(await screen.findByRole("option", { name: /United Kingdom/i }));

    await user.type(screen.getByLabelText(/phone number/i), "7400123456");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(leadsCall(fetchMock)[1].body);
    expect(body.phone).toBe("+447400123456");
    expect(body.phoneCountry).toBe("GB");
  });

  it("sends the chosen nationality as an ISO2 code, not the displayed name", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);

    // The nationality trigger's accessible name comes from its own
    // <label for="nationality">, unlike the phone-country one above — it
    // stays "Nationality (optional)" regardless of what is selected, so
    // every query below targets it by that, not by its changing content.
    await user.click(screen.getByRole("combobox", { name: /nationality/i }));
    await user.type(screen.getByPlaceholderText(/search country or code/i), "United Kingdom");
    await user.click(await screen.findByRole("option", { name: /United Kingdom/i }));

    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(leadsCall(fetchMock)[1].body).nationality).toBe("GB");
  });

  it("clears a chosen nationality back to unset via the 'not specified' row", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);

    await user.click(screen.getByRole("combobox", { name: /nationality/i }));
    await user.click(await screen.findByRole("option", { name: /United Kingdom/i }));
    // Re-open the same trigger — its accessible name never changes.
    await user.click(screen.getByRole("combobox", { name: /nationality/i }));
    await user.click(await screen.findByRole("option", { name: /not specified/i }));

    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(leadsCall(fetchMock)[1].body).nationality).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LINK BLOCKING — lib/links.ts gets its own thorough coverage in
// tests/links.test.ts; this just confirms the form actually wires it in
// the way visitors experience it: an error that appears as they type and a
// submit button that will not let the message through.
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — link blocking", () => {
  it("disables submit and shows an error when the message contains a link", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.type(screen.getByLabelText(/message/i), "check bit.ly/cheap-villa");

    expect(
      await screen.findByText(/please remove the link before sending/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request viewing/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /request viewing/i }));
    // fillValidForm's own email blur already fired the inline check's
    // request — what this test cares about is that the enquiry itself
    // was never posted.
    expect(wasLeadsCallMade(fetchMock)).toBe(false);
  });

  it("re-enables submit once the link is removed", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.type(screen.getByLabelText(/message/i), "check bit.ly/cheap-villa");
    await screen.findByText(/please remove the link before sending/i);

    await user.clear(screen.getByLabelText(/message/i));
    await user.type(screen.getByLabelText(/message/i), "Interested in a sea view villa");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /request viewing/i })).toBeEnabled(),
    );
  });

  it("does not flag a phone number or email address typed into the message", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.type(
      screen.getByLabelText(/message/i),
      "Call 081-234-5678 or james@gmail.com",
    );
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      screen.queryByText(/please remove the link before sending/i),
    ).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INLINE EMAIL CHECK — app/api/validate-email/route.ts, called on blur.
// Advisory for every verdict except "disposable"; see
// components/LeadForm.tsx's checkEmail for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — inline email check", () => {
  it("shows a checking state while the request is in flight", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (requestUrl(input) === "/api/validate-email") {
          return pending.then(() => ({
            ok: true,
            status: 200,
            json: async () => ({ status: "deliverable" }),
          }));
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      }),
    );

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/email address/i), "somchai@gmail.com");
    await user.tab();

    expect(await screen.findByText(/checking this address/i)).toBeInTheDocument();

    release(undefined);
    await screen.findByText(/this address can receive mail/i);
  });

  it("shows the deliverable state once the check resolves", async () => {
    const user = userEvent.setup();
    mockFetch({}, { json: async () => ({ status: "deliverable" }) });

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/email address/i), "somchai@gmail.com");
    await user.tab();

    expect(await screen.findByText(/this address can receive mail/i)).toBeInTheDocument();
  });

  it("shows a typo suggestion and rewrites the field when it is clicked", async () => {
    const user = userEvent.setup();
    mockFetch({}, { json: async () => ({ status: "typo", suggestion: "somchai@gmail.com" }) });

    render(<LeadForm />);
    const email = screen.getByLabelText(/email address/i);
    await user.type(email, "somchai@gmial.com");
    await user.tab();

    const suggestion = await screen.findByRole("button", { name: "somchai@gmail.com" });
    await user.click(suggestion);

    expect(email).toHaveValue("somchai@gmail.com");
  });

  it("shows the no_mx state as advisory only, without blocking submission", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({}, { json: async () => ({ status: "no_mx" }) });

    render(<LeadForm />);
    await fillValidForm(user);

    expect(await screen.findByText(/couldn't find a mail server/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /request viewing/i }));
    await waitFor(() => expect(wasLeadsCallMade(fetchMock)).toBe(true));
  });

  it("renders nothing for the unknown verdict", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (requestUrl(input) === "/api/validate-email") {
          return pending.then(() => ({
            ok: true,
            status: 200,
            json: async () => ({ status: "unknown" }),
          }));
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      }),
    );

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/email address/i), "somchai@example.com");
    await user.tab();

    expect(await screen.findByText(/checking this address/i)).toBeInTheDocument();
    release(undefined);

    // The checking hint has to actually disappear — proof the state
    // update from the resolved promise landed — before checking that
    // nothing else took its place. A DNS failure or a rate limit has
    // nothing useful to say, and a warning about our own infrastructure
    // would only make the visitor doubt a form that is working fine.
    await waitForElementToBeRemoved(() => screen.queryByText(/checking this address/i));
    expect(
      screen.queryByText(/receive mail|did you mean|permanent email|mail server/i),
    ).not.toBeInTheDocument();
  });

  it("blocks submission for a disposable address, and only that verdict", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({}, { json: async () => ({ status: "disposable" }) });

    render(<LeadForm />);
    await user.type(screen.getByLabelText(/full name/i), "Somchai Prasert");
    await user.type(screen.getByLabelText(/phone number/i), "0812345678");
    await user.type(screen.getByLabelText(/email address/i), "bot@mailinator.com");
    await user.click(screen.getByRole("checkbox"));

    await screen.findByText(/please use a permanent email address/i);

    await user.click(screen.getByRole("button", { name: /request viewing/i }));
    expect(wasLeadsCallMade(fetchMock)).toBe(false);
  });

  it("still submits successfully when the validate endpoint itself fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input) === "/api/validate-email") {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await waitFor(() => expect(wasLeadsCallMade(fetchMock)).toBe(true));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SERVER FAILURE MODES
//
// Each status the API can return produces a different message, because
// "something went wrong" for a rate limit is both untrue and unhelpful —
// the visitor's next move differs in every one of these cases.
// ─────────────────────────────────────────────────────────────────────────

describe("LeadForm — server responses", () => {
  it("explains a rate limit rather than calling it an error", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 429 });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    expect(await screen.findByText(/several requests already/i)).toBeInTheDocument();
    expect(trackLead).not.toHaveBeenCalled();
  });

  it("offers the phone as a way round a reCAPTCHA rejection", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 403 });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    // Worded as "try again or call us", never as "you look like a bot" —
    // v3 scores false-positive often enough that the accusation would land
    // on real buyers.
    expect(await screen.findByText(/call us/i)).toBeInTheDocument();
  });

  it("surfaces server-side field errors on the matching inputs", async () => {
    const user = userEvent.setup();
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({ fields: { email: "This address is not deliverable" } }),
    });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    expect(
      await screen.findByText("This address is not deliverable"),
    ).toBeInTheDocument();

    const email = screen.getByLabelText(/email address/i);
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("ignores a server field error for a field the form does not have", async () => {
    const user = userEvent.setup();
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({ fields: { ipAddress: "Blocked range" } }),
    });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    // Setting an error on an unknown key leaves react-hook-form holding a
    // message with nowhere to render — the form then looks fine but will
    // not submit again. The generic message is shown instead.
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText("Blocked range")).not.toBeInTheDocument();
  });

  it("recovers from a network failure without losing what was typed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    // Re-typing a whole enquiry after a dropped connection is how a lead is
    // lost for good.
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Somchai Prasert");
    expect(screen.getByRole("button", { name: /request viewing/i })).toBeEnabled();
  });

  it("survives a success response with an unparseable body", async () => {
    const user = userEvent.setup();
    mockFetch({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    // The lead is written before the response is serialised, so a truncated
    // body must not be reported to the visitor as a failure.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("announces a rate limit through the live region", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 429 });

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const status = await screen.findByRole("status");
    await waitFor(() =>
      expect(status).toHaveTextContent(/several requests already/i),
    );
  });

  it("announces the success dialog through its own dialog role, not the live region", async () => {
    // role="dialog" aria-modal="true" plus aria-labelledby on the heading
    // is the dialog's own announcement — see components/LeadSuccessDialog.tsx's
    // header comment for why success does not also go through the
    // role="status" region every other outcome uses.
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent("Thank you");

    // The generic live region stays empty — this is the one outcome it
    // does not narrate.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
