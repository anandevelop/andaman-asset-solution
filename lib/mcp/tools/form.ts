/**
 * Shared by the tools that save through the back office's form actions:
 * building the FormData an action reads, reading its failure, and catching
 * the redirect Next throws when an action succeeds by navigating.
 */

export type FormValues = Record<string, string | boolean | number | null | undefined>;

export function toForm(values: FormValues): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === true) form.set(key, "on");
    else if (typeof value === "string") form.set(key, value);
    else if (typeof value === "number") form.set(key, String(value));
  }
  return form;
}

export type FormState = { ok: boolean; message?: string; fields?: Record<string, string> };

export function describeFailure(state: FormState): string {
  if (state.fields && Object.keys(state.fields).length) {
    return `VALIDATION_FAILED:${Object.entries(state.fields).map(([field, message]) => `${field} — ${message}`).join("; ")}`;
  }
  return state.message ?? "SAVE_FAILED";
}

/** Next signals a redirect by throwing; the digest carries the destination. */
export function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2] ?? null;
}
