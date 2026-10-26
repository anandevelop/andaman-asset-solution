/**
 * @vitest-environment jsdom
 */
/*
  ViewContent fires once per project page, even when the Pixel only loads
  after the visitor accepts cookies on that page; and neither GA nor the
  Pixel is ever injected on the admin or sign-in pages.
*/
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

let pathname = "/en/projects/victory";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/cookie-consent", () => ({ useCookieConsent: () => ({ consent: { analytics: true, marketing: true } }) }));
vi.mock("next/script", () => ({ default: (props: { id?: string; src?: string }) => <script data-testid={props.id ?? props.src} /> }));

import TrackProjectView from "@/components/TrackProjectView";
import Analytics from "@/components/Analytics";

afterEach(() => {
  vi.useRealTimers();
  delete (window as { fbq?: unknown }).fbq;
});

describe("TrackProjectView", () => {
  it("waits for the Pixel to load, then sends ViewContent once", () => {
    vi.useFakeTimers();
    render(<TrackProjectView projectSlug="victory" projectName="The Victory" />);

    const fbq = vi.fn();
    act(() => vi.advanceTimersByTime(3000));
    expect(fbq).not.toHaveBeenCalled();

    (window as { fbq?: unknown }).fbq = fbq; // accepted on this page
    act(() => vi.advanceTimersByTime(5000));
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("track", "ViewContent", expect.objectContaining({ project: "victory", content_name: "The Victory" }));
  });
});

describe("Analytics", () => {
  it("loads the Pixel and GA on a public page", () => {
    pathname = "/en/projects/victory";
    const { container } = render(<Analytics gaId="G-TEST" metaPixelId="123" />);
    expect(container.querySelectorAll("script").length).toBeGreaterThan(0);
  });

  it.each(["/th/admin/leads", "/en/login"])("loads nothing on %s", (path) => {
    pathname = path;
    const { container } = render(<Analytics gaId="G-TEST" metaPixelId="123" />);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });
});
