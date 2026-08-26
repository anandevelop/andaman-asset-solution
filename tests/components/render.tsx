/**
 * tests/components/render.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * RTL's render, wrapped in the providers a client component actually has
 * around it in the app.
 *
 * The messages are the real messages/en.json rather than a fixture. That is
 * deliberate: a fixture would let a test keep passing after someone deletes
 * a key the component reads, which is exactly the regression worth
 * catching. next-intl throws on a missing key, so the tests fail loudly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactElement } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import th from "@/messages/th.json";

export const messages = { en, th } as const;

type Options = Omit<RenderOptions, "wrapper"> & {
  locale?: keyof typeof messages;
};

export function render(ui: ReactElement, { locale = "en", ...options }: Options = {}) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={locale}
        messages={messages[locale]}
        // Bangkok, so a date rendered in a test matches one rendered on the
        // server. Without it next-intl warns and falls back to the runner's
        // zone, which in CI is UTC.
        timeZone="Asia/Bangkok"
        onError={(error) => {
          // A missing key is a real defect — surface it instead of letting
          // next-intl log and render the key name.
          throw error;
        }}
      >
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  });
}

/*
  Re-exported by name rather than with `export *`.

  A star re-export of @testing-library/react would also pull in its own
  `render`, colliding with the wrapped one above. The spec says the local
  binding wins, but the failure mode when a bundler disagrees is a component
  rendering with no providers and an error message about missing context
  that points at the component rather than at this file — an hour lost for
  the sake of one saved line.
*/
export {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
