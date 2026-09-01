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
import { render, screen, userEvent, waitFor } from "./render";

/** Fill every required field with something valid. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), "Somchai Prasert");
  await user.type(screen.getByLabelText(/phone number/i), "0812345678");
  await user.type(screen.getByLabelText(/email address/i), "somchai@example.com");
  await user.click(screen.getByRole("checkbox"));
}

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
    ...response,
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    expect(messages).toContain("Enter a valid phone number");
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
    expect(fetchMock).not.toHaveBeenCalled();
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/leads");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      name: "Somchai Prasert",
      email: "somchai@example.com",
      phone: "0812345678",
      consentGiven: true,
      projectSlug: "trinity-village",
      source: "PROJECT_PAGE",
    });
    // The PDPA trail: the version consented to must ride along with the
    // consent itself, not be inferred later from the row's timestamp.
    expect(body.consentVersion).toMatch(/^privacy-policy-v/);

    expect(await screen.findByText(/we've received your request/i)).toBeInTheDocument();
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

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
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

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
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

  it("empties the form after a successful send", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm projectSlug="trinity-village" />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    await screen.findByText(/we've received your request/i);

    // waitFor, not a bare assertion: the confirmation and the reset are two
    // separate renders, and the message wins the race.
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue(""));
    expect(screen.getByLabelText(/email address/i)).toHaveValue("");
    // …but the slug survives the reset, or a second enquiry from the same
    // page would arrive unattributed.
    expect(
      document.querySelector('input[name="projectSlug"]'),
    ).toHaveValue("trinity-village");
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
    await screen.findByText(/we've received your request/i);
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
    expect(await screen.findByText(/we've received your request/i)).toBeInTheDocument();
  });

  it("announces the outcome through the live region", async () => {
    const user = userEvent.setup();
    mockFetch({});

    render(<LeadForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /request viewing/i }));

    const status = await screen.findByRole("status");
    await waitFor(() =>
      expect(status).toHaveTextContent(/we've received your request/i),
    );
  });
});
