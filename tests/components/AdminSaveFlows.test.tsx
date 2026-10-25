/**
 * @vitest-environment jsdom
 */
/*
  Two admin save bugs reported on 2026-10-24.

  PageSeoEditor (project → SEO): Save sent only the language on screen. An
  edit in another language tab looked entered and was dropped, so Residence
  Prime's Thai and three of Trinity Village's languages had to be typed in
  again.

  ProjectContentEditor (project → Content & SEO): after a successful Save the
  "unsaved" state never cleared, so the leave-page prompt stayed armed and
  the tab could not be closed without "Leave site?".
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { saveLocaleSeo, saveProjectSeo, saveProjectContent } = vi.hoisted(() => ({
  saveLocaleSeo: vi.fn(),
  saveProjectSeo: vi.fn(),
  saveProjectContent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/[locale]/admin/(catalog)/projects/[id]/seo/actions", () => ({ saveLocaleSeo, saveProjectSeo }));
vi.mock("@/app/[locale]/admin/(catalog)/projects/[id]/content/actions", () => ({ saveProjectContent }));
vi.mock("@/components/admin/ImageUploader", () => ({ default: () => null }));

import PageSeoEditor, { type LocaleSeo } from "@/components/admin/PageSeoEditor";
import ProjectContentEditor from "@/components/admin/ProjectContentEditor";
import { CONTENT_FIELDS } from "@/lib/project-content";

/** Every label is its own key, whatever the component asks for. */
const anyLabels = new Proxy({}, { get: (_, key) => (key === "fields" || key === "sections" ? anyLabels : String(key)) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  saveLocaleSeo.mockResolvedValue({ ok: true });
  saveProjectSeo.mockResolvedValue({ ok: true });
  saveProjectContent.mockResolvedValue({ ok: true, savedAt: new Date().toISOString() });
  window.localStorage.clear();
});

describe("PageSeoEditor", () => {
  const row = (locale: string, label: string): LocaleSeo => ({
    locale,
    label,
    title: "",
    description: "",
    keywords: [],
    noIndex: false,
    complete: false,
  });

  function renderSeo() {
    return render(
      <PageSeoEditor
        adminLocale="th"
        projectId="p1"
        slug="residence-prime"
        siteOrigin="https://andamanassetsolution.com"
        perLocale={[row("th", "ไทย"), row("en", "English"), row("zh", "中文"), row("ru", "Русский")]}
        ogImageUrl=""
        heroImageUrl={null}
        canonicalUrl=""
        sitemapPriority={null}
        sitemapChangeFreq=""
        structuredData={[]}
        labels={anyLabels}
      />,
    );
  }

  const titleInput = () => screen.getByLabelText(/^title/) as HTMLInputElement;

  it("saves every language that was edited, not only the one on screen", async () => {
    renderSeo();
    fireEvent.change(titleInput(), { target: { value: "Thai title" } });
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.change(titleInput(), { target: { value: "English title" } });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/ })));

    await waitFor(() => expect(saveProjectSeo).toHaveBeenCalled());
    const sent = saveLocaleSeo.mock.calls.map(([, input]) => [input.locale, input.metaTitle]);
    expect(sent).toEqual([
      ["en", "English title"],
      ["th", "Thai title"],
    ]);
  });

  it("marks a language with unsaved edits, and clears the mark once saved", async () => {
    renderSeo();
    fireEvent.change(titleInput(), { target: { value: "Thai title" } });
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getAllByLabelText("unsaved")).toHaveLength(1);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/ })));
    await waitFor(() => expect(screen.queryAllByLabelText("unsaved")).toHaveLength(0));
  });

  it("stops on the language that failed and opens it", async () => {
    saveLocaleSeo.mockImplementation(async (_: string, input: { locale: string }) =>
      input.locale === "th" ? { ok: false, error: "VALIDATION_FAILED" } : { ok: true },
    );
    renderSeo();
    fireEvent.change(titleInput(), { target: { value: "Thai title" } });
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.change(titleInput(), { target: { value: "English title" } });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/ })));

    await waitFor(() => expect(screen.getByRole("button", { name: /ไทย/ })).toHaveAttribute("aria-pressed", "true"));
    expect(saveProjectSeo).not.toHaveBeenCalled();
  });
});

describe("ProjectContentEditor", () => {
  const empty = Object.fromEntries(CONTENT_FIELDS.map((field) => [field, ""])) as never;

  it("disarms the leave-page prompt after a successful save", async () => {
    render(
      <ProjectContentEditor
        adminLocale="th"
        projectId="p1"
        projectSlug="residence-prime"
        target="th"
        source="en"
        sourceValues={empty}
        targetValues={empty}
        languages={[]}
        siteOrigin="https://andamanassetsolution.com"
        isPublished
        lastSavedLabel={null}
        labels={anyLabels}
      />,
    );

    const leaving = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    const field = screen.getAllByRole("textbox").find((el) => !(el as HTMLInputElement).readOnly)!;
    fireEvent.change(field, { target: { value: "New tagline" } });
    expect(leaving(), "an unsaved edit should arm the prompt").toBe(true);

    // Published, so the button reads "save and go live".
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: /^saveGoesLive$/ })[0]));
    await waitFor(() => expect(saveProjectContent).toHaveBeenCalled());

    await waitFor(() => expect(leaving(), "still asking to leave after the save").toBe(false));
  });
});
