# End-to-end test status

What `npm run test:e2e` covers, how to run it so the result means something,
and what is currently wrong with it.

Written 2 September 2026, against a run of 60 passed / 1 flaky in 144
seconds. The "Known problems" section is the part that goes stale first —
check it against a run before trusting it.

Mechanics of the suite are in [TESTING.md](./TESTING.md); this file is about
its state and its operational traps.

---

## What it covers

61 tests in four specs, across two Playwright projects.

| Spec | Tests | Journey |
|---|---|---|
| `admin-login.spec.ts` | 28 | Sign-in, 2FA, session cookie, per-section lockout, signed upload URLs |
| `project-listing-filter.spec.ts` | 15 | Listing, filter chips, URL round-trip, sorting, `noindex` on filtered views |
| `lead-submission.spec.ts` | 10 | The enquiry form end to end, including the PDPA consent trail and UTM attribution |
| `mobile-navigation.spec.ts` | 8 | The mobile nav's focus trap and the skip link, at a phone viewport |

Accessibility scans (`@axe-core/playwright`, WCAG 2.1 AA) are attached to the
journeys rather than kept in a separate spec, and cover states a static scan
would miss — a form showing validation errors, an empty filter result, the
mobile menu while open.

### What it does not cover

Worth knowing before treating a green run as proof the back office works:

- **No content editing.** Nothing creates, edits or deletes a project,
  article, event, FAQ or award through the UI. The admin specs stop at
  signing in and at the section guards.
- **No uploads.** `/api/uploads/presign` is covered only for refusal —
  anonymous and 2FA-pending. No test uploads a file.
- **No events spec.** Event pages, RSVP and the seats-left arithmetic have
  no end-to-end coverage. `tests/events.test.ts` covers the arithmetic at
  the unit level; the journey is untested.
- **No email or LINE.** Both are unconfigured during the run by design.

---

## Running it so the answer is trustworthy

```bash
# Local, against `next dev`. What the config does by default.
npm run test:e2e

# What CI actually runs: a production build, then `next start`.
# Roughly 2.5 minutes — about 50 seconds of that is the build.
npm run test:e2e:db
E2E_DB_ALREADY_PREPARED=1 CI=true npm run test:e2e

# While fixing one failure, re-run only what failed rather than all 61.
npx playwright test --last-failed
```

It used to take five and a half minutes, and nearly all of the difference
was waiting rather than testing: every test that signed in shared one admin
account, and `lib/two-factor.ts` burns a TOTP step once a code is accepted,
so each sign-in waited out the rest of the 30-second window before the next
could start. Eleven sign-ins at 25 to 31 seconds each. `totpLastStep` is per
account, so `e2e/fixtures.ts` now seeds a pool and `signIn()` takes the next
one. No protection was weakened — the tests that check replay refusal still
share an account deliberately.

**Run the CI form before pushing anything that touches rendering.** The two
are not equivalent, and the difference is not academic — three separate bugs
this week reproduced only under the production build:

- Keyboard focus and clicks landing before React hydrated. Under `next dev`
  the route compile on first request pushes `load` past hydration, so the
  window does not exist. See `e2e/harness.ts`.
- A filter chip tapped twice in quick succession dropping the first filter
  (`components/ProjectFilterBar.tsx`).
- The Prisma engine failing to load in the container, which produced a
  site that rendered every page empty.

### Two rules that are not optional

**Nothing else may run while the suite runs.** `npm run build`, `typecheck`,
`lint` and `vitest` all compete for CPU, and several tests are load-sensitive
— a busy machine turns a passing suite into a failing one, and the failures
name innocent tests. A contaminated run is worse than no run, because it gets
believed. Two separate investigations this week were wasted on results
poisoned this way, both by running a typecheck during a suite.

**`rm -rf .next` can fail silently.** It exits non-zero with
`rm: .next: Directory not empty` when a Next process writes `.next/trace`
during shutdown, *after* the delete has already removed part of the tree.
The result is a directory holding a mixture of two builds, which surfaces as
`Cannot find module './vendor-chunks/….js'` and every test timing out at 60
seconds against a page serving 500. Always verify:

```bash
pkill -f "next start"; pkill -f "next-server"; sleep 3
for i in 1 2 3; do rm -rf .next; [ ! -d .next ] && break; sleep 2; done
[ -d .next ] && { echo "could not remove .next"; exit 1; }
```

**`reuseExistingServer` is on locally.** A dev server left running from an
earlier, killed run is reused silently — including one serving a broken
`.next`. If the whole suite fails with 60-second timeouts, suspect the build
before the code.

---

## Known problems

### Resolved: the build died inside Playwright (2 September 2026)

Five consecutive CI-mode runs failed before any test executed — `next build`
inside Playwright's `webServer` died and the run reported only
`Process from config.webServer was not able to start`.

The cause was a `server-only` import. `lib/audit/extension.ts` carried one,
`lib/prisma.ts` imports that file, and fifty-eight modules import
`lib/prisma` — so the marker reached all of their graphs. `server-only`
exists to throw when it is evaluated outside a server context, Next's build
workers evaluate modules in more than one, and a worker that hit the throw
died taking its page's artefacts with it. That is why the missing file was
different every run — `/_document`, `sitemap.xml/route.js.nft.json`,
`_not-found/page.js.nft.json`, `/[locale]/news` — and never a compile error.

Fixed by dropping the marker from `lib/audit/context.ts` and
`lib/audit/extension.ts`. Nothing is less protected: nothing imports those
two except `lib/prisma.ts`, and every entry point that reaches them —
`lib/admin/guard.ts`, the server actions, the route handlers — carries the
marker itself.

Worth keeping for the shape of the diagnosis, since the same shape will
recur:

| Hypothesis | How it was ruled out |
|---|---|
| The code does not build | `npm run build` with the same env and `CI=true`: 3/3 pass |
| `webServer.timeout` (180s) killing a slow build | The build takes 52s |
| `prisma generate` racing the build | `globalSetup` returns early under `E2E_DB_ALREADY_PREPARED`; `db push` uses `--skip-generate` |
| The extra Prisma `binaryTargets` | Removed them; still failed |
| The Prisma client extension in `lib/prisma.ts` | Removed it; **build passed** — then narrowed to the import inside it |

### Flaky: `project-listing-filter.spec.ts`

Two tests flake under load, passing on CI's single retry:

- `marks the active chip as pressed`
- `offers a way out of an empty result`

Both are the same hydration race the harness gate mitigates rather than
eliminates: a click landing between `load` and React attaching handlers. They
pass 12/12 when the spec runs alone, and fail perhaps one run in three inside
the full suite. `playwright.config.ts` sets `retries: 1` in CI, so they do not
fail the build — but the config's own comment is right that a test which only
passes on the second attempt is telling you something.

---

## The fixture database

`E2E_DATABASE_URL` is wiped and reseeded on every run. `e2e/global-setup.ts`
refuses to run when it matches `DATABASE_URL`, so it cannot destroy a
development database by accident.

Fixture accounts, all in `e2e/fixtures.ts`:

- `ADMIN` — `SUPER_ADMIN` with 2FA enrolled. Used where a test needs a known
  identity, and for the negative cases that never reach the second factor.
- `ADMIN_POOL` — twelve interchangeable copies, one handed to each full
  sign-in so no two contend for the same burned TOTP step. See the timing
  note above for why they exist.
- `PENDING_ADMIN` — `ADMIN` with no second factor, held at enrolment. Exists
  to prove the 2FA gate holds on paths middleware cannot see; it is what
  covers `/api/uploads/presign` refusing a signed-in account that still owes
  enrolment.

---

## Reading a failure

1. **Every test failed with a 60-second timeout** → the build, not the code.
   Check `.next` for a partial tree and rebuild from empty.
2. **The run never reached a test** → `webServer` failed. The build output is
   in the log above the Playwright summary.
3. **One test failed, and it is different each run** → load-sensitive race.
   Confirm by running that spec alone; if it passes repeatedly, the suite was
   competing with something.
4. **The same test fails alone and in the suite** → a real regression.

Artefacts for failures are in `test-results/` (trace, video, screenshot,
`error-context.md` with the page snapshot at the moment of failure). Open a
trace with `npx playwright show-trace test-results/<dir>/trace.zip`.
