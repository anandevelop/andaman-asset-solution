# Testing

How this project is tested, why it is tested that way, and what the tests
deliberately do not cover.

---

## The short version

```bash
npm run verify          # lint + typecheck + unit tests — run before pushing
npm test                # unit tests only (fast, no database)
npm run test:watch      # unit tests, watching
npm run test:coverage   # unit tests + coverage report

createdb andaman_e2e    # once
npm run test:e2e:install   # once — downloads Chromium
npm run test:e2e        # end-to-end (real server, real Postgres, real browser)
```

`npm run verify` is what CI gates a pull request on, minus the e2e job.

---

## The two layers

There are two, and the split is by **what a failure tells you**, not by
some notion of purity.

| | Vitest (`tests/`) | Playwright (`e2e/`) |
|---|---|---|
| Runs in | Node + jsdom | Chromium, against a real server |
| Needs a database | no | yes, its own |
| Speed | ~10s for 380 tests | ~90s |
| A failure means | this function or component is wrong | this journey is broken |

**Vitest covers logic and components.** Everything in `lib/` that makes a
decision — the markdown sanitiser, the LINE signature check, the CSV
escaper, the price bands, the validation schemas — plus `LeadForm`, which
is the only component whose behaviour is complicated enough to be worth
pinning.

**Playwright covers journeys.** Three of them, chosen because each crosses
a boundary the unit tests mock away: submitting an enquiry (does the row
actually reach Postgres?), signing in (does the middleware actually
redirect?), filtering projects (does the URL actually reproduce the view?).

Nothing sits between the two. There is no "integration" tier, because a
test that boots half the stack tends to inherit the cost of the e2e layer
and the blind spots of the unit layer.

---

## Unit tests — `tests/`

```
tests/
  setup.ts                  runs before every file; jsdom stubs live here
  render.tsx                → tests/components/render.tsx
  stubs/server-only.ts      neutralises the `server-only` import guard
  vitest.d.ts               types for the jest-dom matchers
  *.test.ts                 lib/ logic, Node environment
  lib/validations.test.ts   the zod schemas
  components/*.test.tsx     React, jsdom environment
```

### Two environments, one command

`vitest.config.ts` routes `tests/components/**` to jsdom and leaves
everything else in Node:

```ts
environment: "node",
environmentMatchGlobs: [["tests/components/**", "jsdom"]],
```

One `npm test` runs both. Two config files would be tidier and would mean
somebody eventually runs only half.

### Rendering a component

Always through `tests/components/render.tsx`, never RTL's `render`
directly — the wrapper supplies the `NextIntlClientProvider` that every
client component in this codebase assumes:

```tsx
import { render, screen, userEvent } from "./render";

render(<LeadForm />);              // English
render(<LeadForm />, { locale: "th" });  // Thai
```

It loads the real `messages/en.json`, not a fixture, and throws on a
missing key. A fixture would let a test keep passing after someone deletes
a translation the component reads — which is precisely the regression worth
catching.

### What the component tests assert on

Roles, labels and visible text. Never class names, never internal state:

```tsx
// yes
screen.getByLabelText(/email address/i)
screen.getByRole("button", { name: /request viewing/i })

// no
container.querySelector(".text-red-600")
```

This is not style. Querying by accessible role means the test fails when
the accessible name breaks — so the suite doubles as an accessibility check
at zero extra cost, and a refactor that changes markup without changing
behaviour produces no red.

### Coverage

```bash
npm run test:coverage   # writes coverage/index.html
```

Thresholds are in `vitest.config.ts` and are enforced in CI. The scope is
`lib/**` and `components/**` only — pages and layouts are Playwright's job,
and including them would produce a low headline number that says nothing
about the logic this suite protects, which is how a team learns to ignore
coverage entirely.

Four modules are held far above the project floor, because a silent
regression in them is dangerous rather than merely annoying:

| Module | Why |
|---|---|
| `lib/markdown.ts` | It is the XSS boundary. Article bodies are author-supplied HTML. |
| `lib/csv.ts` | Formula injection: a lead named `=cmd\|...` becomes an executable cell in Excel. |
| `lib/project-filters.ts` | Half-open price bands. An off-by-one puts a ฿40M villa in two bands or none. |
| `lib/line.ts` | HMAC signature verification on the webhook. |

---

## End-to-end tests — `e2e/`

```
e2e/
  global-setup.ts               pushes schema, wipes, seeds — runs once
  fixtures.ts                   the seeded data, shared with the specs
  a11y.ts                       axe-core helper
  lead-submission.spec.ts       the enquiry journey
  admin-login.spec.ts           auth and the back-office guard
  project-listing-filter.spec.ts  URL-driven filtering
  mobile-navigation.spec.ts     the disclosure menu (mobile project only)
```

### ⚠ The e2e database is wiped on every run

`global-setup.ts` truncates every table before seeding. It therefore
**refuses to start** unless `E2E_DATABASE_URL` is set *and* differs from
`DATABASE_URL`. That guard is not paranoia — the alternative is one
absent-minded `npm run test:e2e` destroying a development database, or,
once somebody has a production URL in their shell, considerably worse.

Setup, once:

```bash
createdb andaman_e2e
```

```bash
# .env
E2E_DATABASE_URL="postgresql://andaman_admin:changeme_local_only@localhost:5432/andaman_e2e?schema=public"
```

Then:

```bash
npm run test:e2e:install   # downloads Chromium, ~150MB, once
npm run test:e2e
```

### What the server under test gets

`playwright.config.ts` starts its own Next server on port 3100 with a
deliberately minimal environment. reCAPTCHA, GA4, Meta Pixel, Sentry and S3
are all left **unset**, so their "feature not configured" paths run — which
are also the paths a first deploy takes, and are therefore worth
exercising. A suite that only works with every third-party key present is a
suite nobody can run.

One exception: `RATE_LIMIT_DISABLED=1`. Every request in a run comes from
127.0.0.1, so the limiter correctly sees one client submitting a dozen
enquiries in ninety seconds and starts refusing them. Without the flag the
tests fail on the limiter rather than on the behaviour under test. It is
read once at module load, is set nowhere except `playwright.config.ts`, and
turning it on in production would remove the only brute-force protection on
the sign-in route.

### Dev server locally, production build in CI

```ts
command: process.env.CI
  ? `npm run build && npx next start -p ${PORT}`
  : `npx next dev -p ${PORT}`;
```

The difference matters: `next build` is where ISR, route segment config and
the standalone output actually take effect, and a page that renders in dev
can still fail to prerender. Locally the build would add six minutes to
every run, which means nobody would run these before pushing — worse than
the coverage gap.

### Serial, single worker

The suite writes leads and reads them back, and the login spec depends on a
known session state. Parallel workers sharing one database make both flaky
in ways that look exactly like real failures. It costs about a minute.

### Debugging a failure

```bash
npm run test:e2e:ui        # step through interactively
npm run test:e2e:headed    # watch it drive a visible browser
npm run test:e2e:report    # open the HTML report from the last run
npx playwright test e2e/admin-login.spec.ts -g "wrong password"
```

CI uploads `playwright-report/` on every run and `test-results/` on
failure. A trace opens with `npx playwright show-trace <path>` and replays
the run frame by frame — DOM snapshots, network, console — which beats
guessing from a screenshot.

---

## Accessibility

### What is automated

`e2e/a11y.ts` wraps `@axe-core/playwright` and checks WCAG 2.1 A and AA.
Scans are attached to the journeys rather than isolated in an
"accessibility spec", because a page in its default state is the easy case.
The states worth scanning are the ones only a journey reaches:

- the lead form showing validation errors
- the login form showing a failed attempt
- the mobile menu while it is open
- a filtered listing, and an empty result
- the admin dashboard

### What automation cannot do

**axe catches roughly a third of WCAG failures — the mechanical third.**
Missing accessible names, unlabelled controls, insufficient contrast,
broken heading order. It cannot tell you whether the focus order makes
sense, whether alt text is honest, whether an error message is
comprehensible, or whether a live region announces at a useful moment.

A green axe run is a floor, not a certificate. Before launch, walk the site
once with VoiceOver (⌘F5 on macOS) and once with the keyboard alone.

### What the Phase 11 audit found and fixed

Contrast was computed, not eyeballed. Every ratio below is against the
actual rendered background.

| Element | Was | Ratio | Now | Ratio |
|---|---|---|---|---|
| `.eyebrow`, links, icons | `accent-600` `#c47b3a` | 3.20 ✗ | `accent-700` `#9c602c` | 4.84 ✓ |
| Hover state on those links | `accent-700` | — | `accent-800` `#7a4a20` | 7.06 ✓ |
| Body muted text | `ink/60` | 4.21 ✗ | `ink/70` | 5.75 ✓ |
| Fine print, captions | `ink/40`, `ink/45`, `ink/50` | 2.39–3.11 ✗ | `ink/65` | 4.87 ✓ |
| Footer copyright | `white/45` on navy | 3.9 ✗ | `white/60` | 5.60 ✓ |
| LINE floating button | white on `#06C755` | 2.26 ✗ | white on `#03702E` | 6.25 ✓ |
| Form error text | `red-600` | ~4.0 ✗ | `red-700` | 5.9 ✓ |

`accent-600` is still used for backgrounds and decorative icons, where the
requirement is 3:1 rather than 4.5:1 and it passes.

Beyond contrast:

- **The mobile menu had no focus trap and no Escape handler.** It covers
  the page, so tabbing past its last link walked invisibly into the links
  underneath — the focus ring vanishes and the user is operating controls
  they cannot see. Both are fixed in `components/Navbar.tsx` and pinned by
  `e2e/mobile-navigation.spec.ts`.
- **No skip link.** Seven nav items plus a language switch and a phone CTA
  sat ahead of the content on every page. Added in `(site)/layout.tsx`,
  visually hidden until focused — `sr-only` alone would make it
  unfocusable, and therefore unreachable by the people it exists for.
- **The lead form had no live region.** The four status messages each
  rendered as a fresh `<p>`, and a live region that appears at the same
  moment as its own text is never announced. Someone who could not see the
  green tick was told nothing about whether their enquiry sent. Now one
  `role="status"` container, mounted unconditionally.
- **The language switch was labelled "TH" / "EN"** — read as "tee aitch",
  with no indication of where it goes. Now `aria-label` in the target
  language, plus `lang` and `hrefLang` so a Thai label is not read by an
  English voice.
- **Two `<nav>` landmarks had no names.** "navigation, navigation" in a
  landmark list tells you nothing.

### The bug the tests found

Worth recording, because it is the kind that survives review.

`LeadForm` called `reset({ projectSlug })` after a successful send. It did
nothing. react-hook-form only clears the DOM by delegating to the native
`form.reset()`, and it only does that when `reset` is called with **no
argument** — see `if (isWeb && isUndefined(values))` in its `_reset`.
Passing an object drops its internal field map and leaves every
uncontrolled `<input>` holding the text the visitor typed.

The symptom: a fully populated form sitting underneath a "thank you, we'll
be in touch" message. It reads as though nothing was sent, and the obvious
response — pressing submit again — files a duplicate lead that the Phuket
team then calls twice.

Nobody had noticed, because a bug that produces a *more* filled-in screen
does not look like a bug. `tests/components/LeadForm.test.tsx` now asserts
the fields are empty afterwards, and the hidden project slug survives via
`defaultValue`, which is what a native form reset restores to.

---

## Conventions

**Test the behaviour, not the implementation.** If a test would still pass
after the feature broke, or fails after a rename that changed nothing, it
is testing the wrong thing.

**One assertion per idea, and name the idea.** `it("turns an empty price
into null, not zero")` beats `it("handles edge cases")` — the name is what
you read first when it fails at 2am.

**Comment the *why*, never the *what*.** `// The bug this guards:
Number("") is 0, and a villa listed at ฿0 would go live looking like a
scam` earns its line. `// parse the price` does not.

**Boundaries get a test on each side.** A party size of 10 is accepted and
11 is not; both are asserted, because only having one leaves the boundary
itself untested.

**A disabled axe rule needs a written reason.** `e2e/a11y.ts` takes
`disableRules` as `Record<rule, reason>` rather than an array, so the
justification appears in the diff. An undocumented exclusion is how a suite
stays green while the site regresses.

---

## Known gaps

Deliberate, and listed so they are decisions rather than oversights.

- **No visual regression testing.** Screenshot diffing is high-maintenance
  on a site whose photography changes, and the CI cost is real. Layout
  breakage is caught by eye.
- **Server actions are tested through the UI, not directly.** The admin
  CRUD actions run inside a request context that is awkward to construct in
  Vitest. They are covered indirectly by the admin e2e specs and directly
  by the schema tests, which is where the interesting logic lives.
- **Chromium only.** Firefox and WebKit triple the browser download and
  catch nothing these journeys depend on. Add them when a cross-browser bug
  actually appears.
- **The reCAPTCHA verified path is not covered end to end.** It needs
  Google's live service. The skip and reject branches are unit-tested in
  `tests/recaptcha.test.ts`.
- **S3 uploads are not covered end to end.** They need real credentials and
  would write real objects. `tests/s3.test.ts` covers key construction,
  content-type allowlisting and size limits.
- **No load testing.** The rate limiter is per-process, so its behaviour
  under a multi-instance deploy is untested by design — see the note in
  `lib/rate-limit.ts` and the Redis item in `docs/LAUNCH_CHECKLIST.md`.

---

## Adding a test

**Logic in `lib/`** → `tests/<module>.test.ts`. Node environment, no
setup required.

**A React component** → `tests/components/<Component>.test.tsx`. jsdom is
applied automatically by the glob; render through `./render`.

**A new journey** → `e2e/<journey>.spec.ts`. If it needs seed data, add it
to `e2e/fixtures.ts` and to `global-setup.ts`'s `seed()` — never to
`prisma/seed.ts`, which is the developer's local data and is not wiped.
