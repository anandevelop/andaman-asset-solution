/**
 * tests/components/HeroCarousel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The homepage hero. jsdom has no layout and paints nothing, so what is
 * checked here is the behaviour that does not depend on either: the window's
 * arithmetic, which headline size a caption gets, the rail and its
 * accessibility contract, the lock while a change is in flight, what is
 * mounted when (three layers at most, the next one only after the first has
 * loaded), and what the reduced-motion and off-screen paths refuse to run.
 * What the window LOOKS like is a browser's business, and was checked in one.
 *
 * Fake timers throughout: the component is driven by setTimeout and
 * requestAnimationFrame, and the fake clock advances both together, so
 * "1500ms later" is a line of code rather than a wait.
 *
 * ImageWithSkeleton is replaced with a bare <img>. next/image needs the
 * app's loader config, and what is worth asserting is not its markup but
 * the props the hero hands it: `priority` on the first slide only, and
 * `loading="eager"` on all of them.
 */

// @vitest-environment jsdom

import type { CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeroCarousel, { headlineTier, windowInsets } from "@/components/HeroCarousel";
import type { HeroStorySlide } from "@/lib/hero-story";
import { act, fireEvent, render, screen, within } from "./render";

type MockImageProps = {
  src: string;
  alt: string;
  priority?: boolean;
  loading?: string;
  className?: string;
  style?: CSSProperties;
  onLoad?: () => void;
};

vi.mock("@/components/ImageWithSkeleton", () => ({
  default: ({ src, alt, priority, loading, className, style, onLoad }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element -- the stand-in for next/image
    <img
      src={src}
      alt={alt}
      data-testid="hero-image"
      data-priority={String(Boolean(priority))}
      data-loading={loading}
      className={className}
      style={style}
      onLoad={onLoad}
    />
  ),
}));

function slide(n: number, overrides: Partial<HeroStorySlide> = {}): HeroStorySlide {
  return {
    id: `s${n}`,
    mediaType: "IMAGE",
    mediaUrl: `https://cdn.test/slide-${n}.jpg`,
    posterImageUrl: null,
    durationSeconds: 5,
    ctaUrl: null,
    label: null,
    caption: null,
    tagline: null,
    ctaLabel: null,
    ...overrides,
  };
}

const THREE = [
  slide(1, {
    label: "Trinity Village · Cherngtalay",
    caption: "Land chosen first.\nHouses built second.",
    tagline: "Tagline one",
    ctaLabel: "View project",
    ctaUrl: "/projects/trinity-village",
  }),
  slide(2, {
    label: "The Residence · Bang Tao",
    caption: "Second caption",
    tagline: "Tagline two",
  }),
  slide(3, { label: "Marina Bay · Rawai", caption: "Third caption" }),
];

const fallback = {
  imageUrl: "https://cdn.test/fallback.jpg",
  eyebrow: "Fallback eyebrow",
  title: "Fallback title",
  subtitle: "Fallback subtitle",
  ctaLabel: "Fallback CTA",
  ctaHref: "/projects",
  ctaSecondaryLabel: "Fallback secondary",
  ctaSecondaryHref: "/contact",
};

const labels = { previousSlide: "Previous slide", nextSlide: "Next slide" };

function setup(slides: HeroStorySlide[] = THREE) {
  return render(
    <HeroCarousel
      slides={slides}
      fallback={fallback}
      labels={labels}
      eyebrow="Phuket · Since 2009"
      scrollLabel="Scroll"
    />,
  );
}

/** Advance the fake clock inside act, so the state the timers set is flushed. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function media({ reduced = false, wide = false } = {}) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reduced : query.includes("min-width") && wide,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

/** The rail's buttons, in slide order. */
function railButtons() {
  return within(screen.getByRole("list")).getAllByRole("button");
}

function current() {
  return railButtons().findIndex((button) => button.getAttribute("aria-current") === "true");
}

/** The headline's <p>, or null when the slide has no caption. */
function headline(container: HTMLElement) {
  return container.querySelector("p.font-light");
}

beforeEach(() => {
  vi.useFakeTimers();
  media();
  // jsdom logs "not implemented" for every getContext; a canvas with no
  // context is what the dust already tolerates.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("windowInsets", () => {
  it("starts as a 4% × 8% slot in the middle, and ends fully open", () => {
    expect(windowInsets(0)).toEqual({ v: 46, h: 48 });
    expect(windowInsets(1)).toEqual({ v: 0, h: 0 });
  });

  it("is full height before it starts to widen", () => {
    // 0.35 is where the vertical stage ends; the horizontal one has run for
    // 0.05 of its 0.7 and has barely begun.
    const { v, h } = windowInsets(0.35);
    expect(v).toBe(0);
    expect(h).toBeGreaterThan(47.9);
  });

  it("does not move sideways at all until k = 0.3", () => {
    expect(windowInsets(0.1).h).toBe(48);
    expect(windowInsets(0.3).h).toBe(48);
  });

  it("is half open at the midpoint of the horizontal stage", () => {
    expect(windowInsets(0.65).h).toBeCloseTo(24, 6);
  });

  it("never closes again: neither inset ever grows", () => {
    let last = windowInsets(0);

    for (let k = 0.01; k <= 1; k += 0.01) {
      const next = windowInsets(k);
      expect(next.v).toBeLessThanOrEqual(last.v + 1e-9);
      expect(next.h).toBeLessThanOrEqual(last.h + 1e-9);
      last = next;
    }
  });
});

describe("headlineTier", () => {
  it("keeps an ordinary two-line caption at full size, in every locale", () => {
    expect(headlineTier(["Land chosen first.", "Houses built second."])).toBe(0);
    expect(headlineTier(["เลือกที่ดินก่อน", "แล้วจึงสร้างบ้าน"])).toBe(0);
    expect(headlineTier(["Сначала — земля.", "Потом — дом."])).toBe(0);
    expect(headlineTier(["先选地块。", "后建房屋。"])).toBe(0);
  });

  it("gives no caption at all the largest size rather than throwing", () => {
    expect(headlineTier([])).toBe(0);
  });

  it("steps down for a caption that would wrap past three rows", () => {
    expect(
      headlineTier([
        "Every plot is chosen for its aspect first",
        "and only then is a house designed to sit on it",
      ]),
    ).toBeGreaterThan(0);
  });

  it("takes the last tier for anything, however long", () => {
    const line = "A caption that keeps going well past what any hero should hold ".repeat(4);
    expect(headlineTier([line, line, line])).toBe(2);
  });

  it("counts a CJK character as a full em, so it wraps sooner than Latin", () => {
    // 40 wide characters are 40em: past the first size's three rows of 10em.
    // 40 narrow ones are about 22em and fit.
    const cjk = "选".repeat(40);
    const latin = "n".repeat(40);
    expect(headlineTier([cjk])).toBeGreaterThan(headlineTier([latin]));
  });

  it("does not count Thai tone marks and stacked vowels as width", () => {
    // Same base letters, with and without the marks above them.
    expect(headlineTier(["ที่ดินที่ดินที่ดินที่ดิน"])).toBe(headlineTier(["ทดนทดนทดนทดน"]));
  });
});

describe("HeroCarousel", () => {
  describe("with no slides", () => {
    it("renders the static fallback, with both of its buttons", () => {
      setup([]);

      expect(screen.getByText("Fallback title")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Fallback CTA" })).toHaveAttribute("href", "/projects");
      expect(screen.getByRole("link", { name: "Fallback secondary" })).toHaveAttribute(
        "href",
        "/contact",
      );
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("has no <h1>: the page's one lives in CompanyIntro", () => {
      const { container } = setup([]);
      expect(container.querySelector("h1")).toBeNull();
    });
  });

  describe("with one slide", () => {
    it("has no rail, no counter and no scroll-cue conflict — nothing to choose between", () => {
      const { container } = setup([THREE[0]]);

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(container.querySelector("[aria-live]")).toBeNull();
    });

    it("never changes slide, however long it waits", () => {
      setup([THREE[0]]);
      tick(30_000);
      expect(screen.getAllByTestId("hero-image")).toHaveLength(1);
    });
  });

  describe("the copy", () => {
    it("renders the headline as a <p> and never as a heading", () => {
      const { container } = setup();

      expect(container.querySelector("h1")).toBeNull();
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(headline(container)?.tagName).toBe("P");
    });

    it("puts each caption line in its own mask", () => {
      const { container } = setup();
      const lines = headline(container)!.children;

      expect(lines).toHaveLength(2);
      expect(lines[0]).toHaveTextContent("Land chosen first.");
      expect(lines[1]).toHaveTextContent("Houses built second.");
      // The clip that hides a line until it rises would cut Thai tone marks
      // off without this padding.
      expect(lines[0].className).toContain("pt-[0.14em]");
      expect(lines[0].className).toContain("pb-[0.1em]");
    });

    it("shows the site-wide eyebrow, and the slide's tagline", () => {
      setup();
      expect(screen.getByText("Phuket · Since 2009")).toBeInTheDocument();
      expect(screen.getByText("Tagline one")).toBeInTheDocument();
    });

    it("renders no headline element for a slide without a caption", () => {
      const { container } = setup([slide(1), slide(2)]);
      expect(headline(container)).toBeNull();
    });

    it("enters after two frames, not at once", () => {
      const { container } = setup();
      const copy = () => container.querySelector("[data-phase]");

      expect(copy()).toHaveAttribute("data-phase", "hidden");
      tick(100);
      expect(copy()).toHaveAttribute("data-phase", "in");
    });
  });

  describe("the call to action", () => {
    it("is the admin's own button and nothing else", () => {
      setup();

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveTextContent("View project");
      expect(links[0]).toHaveAttribute("href", "/projects/trinity-village");
      expect(links[0]).toHaveClass("btn-hero");
    });

    it("is absent when the slide has a label but no link", () => {
      setup([slide(1, { ctaLabel: "Go", ctaUrl: null }), slide(2)]);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("is absent when the slide has a link but no label", () => {
      setup([slide(1, { ctaLabel: null, ctaUrl: "/somewhere" }), slide(2)]);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  describe("the rail", () => {
    it("has one button per slide, named for its number and its project", () => {
      setup();

      expect(railButtons().map((b) => b.getAttribute("aria-label"))).toEqual([
        "01 Trinity Village · Cherngtalay",
        "02 The Residence · Bang Tao",
        "03 Marina Bay · Rawai",
      ]);
    });

    it("marks exactly the slide on screen with aria-current", () => {
      setup();

      expect(railButtons().filter((b) => b.hasAttribute("aria-current"))).toHaveLength(1);
      expect(current()).toBe(0);
    });

    it("splits the label on its first ' · ' into a name and a description", () => {
      setup();

      const rail = within(screen.getByRole("list"));
      expect(rail.getByText("Trinity Village")).toBeInTheDocument();
      expect(rail.getByText("Cherngtalay")).toBeInTheDocument();
    });

    it("keeps a second ' · ' inside the description", () => {
      setup([slide(1, { label: "Trinity · Cherngtalay · Phase 2" }), slide(2)]);
      expect(screen.getByText("Cherngtalay · Phase 2")).toBeInTheDocument();
    });

    it("shows just the number for a slide with no label", () => {
      setup([slide(1), slide(2)]);

      expect(railButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["01", "02"]);
    });

    it("announces the position in an sr-only live region", () => {
      const { container } = setup();
      const live = container.querySelector("[aria-live]")!;

      expect(live).toHaveClass("sr-only");
      expect(live).toHaveTextContent("01 / 03");
    });

    it("drops the descriptions and shares the width past four slides", () => {
      setup([1, 2, 3, 4, 5].map((n) => slide(n, { label: `Project ${n} · Place ${n}` })));

      expect(railButtons()).toHaveLength(5);
      expect(screen.queryByText("Place 1")).not.toBeInTheDocument();
      expect(screen.getByText("Project 1")).toHaveClass("truncate");
    });

    it("keeps the descriptions at four slides", () => {
      setup([1, 2, 3, 4].map((n) => slide(n, { label: `Project ${n} · Place ${n}` })));
      expect(screen.getByText("Place 1")).toBeInTheDocument();
    });

    it("has no arrow buttons anywhere", () => {
      setup();

      expect(screen.queryByRole("button", { name: labels.previousSlide })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: labels.nextSlide })).not.toBeInTheDocument();
    });
  });

  describe("changing slide", () => {
    it("moves to the clicked slide at once and locks until the window has opened", () => {
      setup();

      fireEvent.click(railButtons()[1]);
      expect(current()).toBe(1);

      // A second click while the window is opening is ignored.
      tick(700);
      fireEvent.click(railButtons()[2]);
      expect(current()).toBe(1);

      tick(900); // 1600ms in: the 1500ms window has closed
      fireEvent.click(railButtons()[2]);
      expect(current()).toBe(2);
    });

    it("updates the live counter", () => {
      const { container } = setup();

      fireEvent.click(railButtons()[2]);
      expect(container.querySelector("[aria-live]")).toHaveTextContent("03 / 03");
    });

    it("clicking the slide already showing does nothing", () => {
      const { container } = setup();

      fireEvent.click(railButtons()[0]);
      expect(current()).toBe(0);
      // No window opened for it, so no frame, and no lock to wait out.
      expect(container.querySelector("[class*='rgba(243,213,179,0.95)']")).toBeNull();
      fireEvent.click(railButtons()[1]);
      expect(current()).toBe(1);
    });

    it("draws the sand frame only while the window is opening", () => {
      const { container } = setup();
      const frame = () => container.querySelector("[class*='rgba(243,213,179,0.95)']");

      expect(frame()).toBeNull();
      fireEvent.click(railButtons()[1]);
      expect(frame()).not.toBeNull();

      tick(1600);
      expect(frame()).toBeNull();
    });

    it("swaps the top-left label at 400ms and the copy at 500ms", () => {
      const { container } = setup();
      const label = () => container.querySelector("[class*='tracking-widest2']:not(p)");

      expect(screen.getAllByText("Trinity Village · Cherngtalay").length).toBeGreaterThan(0);
      fireEvent.click(railButtons()[1]);

      tick(300);
      expect(headline(container)).toHaveTextContent("Land chosen first.");
      expect(label()).toHaveTextContent("Trinity Village · Cherngtalay");

      tick(150); // 450: label is swapped, copy not yet
      expect(label()).toHaveTextContent("The Residence · Bang Tao");
      expect(headline(container)).toHaveTextContent("Land chosen first.");

      tick(100); // 550: copy swapped
      expect(headline(container)).toHaveTextContent("Second caption");
    });

    it("fades the old copy out before the swap and the new copy in after", () => {
      const { container } = setup();
      const phase = () => container.querySelector("[data-phase]")!.getAttribute("data-phase");

      tick(100);
      expect(phase()).toBe("in");

      fireEvent.click(railButtons()[1]);
      expect(phase()).toBe("out");

      tick(520);
      expect(phase()).toBe("hidden");

      tick(100);
      expect(phase()).toBe("in");
    });

    it("wraps around with the arrow keys, forwards and backwards", () => {
      setup();
      const list = screen.getByRole("list");

      fireEvent.keyDown(railButtons()[0], { key: "ArrowLeft" });
      expect(current()).toBe(2);

      tick(1600);
      fireEvent.keyDown(list, { key: "ArrowRight" });
      expect(current()).toBe(0);
    });

    it("ignores other keys", () => {
      setup();

      fireEvent.keyDown(railButtons()[0], { key: "Enter" });
      fireEvent.keyDown(railButtons()[0], { key: "ArrowUp" });
      expect(current()).toBe(0);
    });

    it("advances when the current image's bar finishes", () => {
      setup();
      const bar = railButtons()[0].querySelector("span[aria-hidden] > span")!;

      fireEvent.animationEnd(bar);
      expect(current()).toBe(1);
    });

    it("queues an auto-advance that arrives mid-window, rather than losing it", () => {
      // An admin can set a slide to 1s, shorter than the 1.5s window. If the
      // advance were dropped, nothing would ever bring the bar's animationend
      // back and the carousel would sit on that slide for good.
      setup();

      fireEvent.click(railButtons()[1]);
      const bar = railButtons()[1].querySelector("span[aria-hidden] > span")!;

      tick(400);
      fireEvent.animationEnd(bar);
      expect(current()).toBe(1);

      tick(1200); // the window closes and the queued advance runs
      expect(current()).toBe(2);
    });
  });

  describe("the layers", () => {
    it("mounts the first slide alone, with the priority", () => {
      setup();

      const images = screen.getAllByTestId("hero-image");
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute("src", "https://cdn.test/slide-1.jpg");
      expect(images[0]).toHaveAttribute("data-priority", "true");
    });

    it("mounts the next slide once the first has loaded, hidden and eager", () => {
      setup();

      fireEvent.load(screen.getByTestId("hero-image"));

      const images = screen.getAllByTestId("hero-image");
      expect(images).toHaveLength(2);

      const next = images[1];
      expect(next).toHaveAttribute("src", "https://cdn.test/slide-2.jpg");
      expect(next).toHaveAttribute("data-priority", "false");
      expect(next).toHaveAttribute("data-loading", "eager");
      // `invisible`, not `hidden`: display:none gives the image no box and
      // next/image would never fetch it.
      expect(next.parentElement).toHaveClass("invisible");
      expect(next.parentElement).not.toHaveClass("hidden");
    });

    it("mounts the next slide after 2.5s even if the first never reports loading", () => {
      setup();

      tick(2400);
      expect(screen.getAllByTestId("hero-image")).toHaveLength(1);

      tick(200);
      expect(screen.getAllByTestId("hero-image")).toHaveLength(2);
    });

    it("never has a third image, and never a second before the window", () => {
      setup([1, 2, 3, 4, 5].map((n) => slide(n)));

      tick(3000);
      expect(screen.getAllByTestId("hero-image")).toHaveLength(2);
    });

    it("keeps one element per slide across next → current → previous", () => {
      // The whole point of keying on slide.id: the browser keeps the decoded
      // picture, and a playing <video> is not restarted.
      setup();
      tick(3000);

      const second = screen.getAllByTestId("hero-image")[1];
      fireEvent.click(railButtons()[1]);

      expect(screen.getAllByTestId("hero-image")).toContain(second);
      expect(second.isConnected).toBe(true);

      tick(1600);
      expect(screen.getAllByTestId("hero-image")).toContain(second);
    });

    it("holds three layers at most while a window is opening", () => {
      setup([1, 2, 3, 4].map((n) => slide(n)));
      tick(3000);

      fireEvent.click(railButtons()[1]);
      expect(screen.getAllByTestId("hero-image").length).toBeLessThanOrEqual(3);

      tick(1600);
      expect(screen.getAllByTestId("hero-image")).toHaveLength(2);
    });

    it("gives the outgoing layer its shrink and the incoming its clip", () => {
      setup();
      tick(3000);

      const [first, second] = screen.getAllByTestId("hero-image");
      fireEvent.click(railButtons()[1]);

      expect(first.parentElement!.style.transform).toBe("scale(0.96)");
      expect(first.parentElement!.style.transition).toContain("1500ms");
      expect(second.parentElement).toHaveClass("z-[2]");
      expect(first.parentElement).toHaveClass("z-[1]");
    });

    it("runs the zoom-out for the hold time plus the window, and not on the hidden next layer", () => {
      setup([slide(1, { durationSeconds: 4 }), slide(2)]);
      tick(3000);

      const [first, second] = screen.getAllByTestId("hero-image");
      expect(first.style.animationName).toBe("hero-zoom-out");
      expect(first.style.animationDuration).toBe("5.5s");
      expect(first.style.transformOrigin).toBe("60% 55%");
      expect(second.style.animationName).toBe("");
    });
  });

  describe("a video slide", () => {
    const VIDEOS = [
      slide(1, { mediaType: "VIDEO", mediaUrl: "https://cdn.test/one.mp4", posterImageUrl: "https://cdn.test/one.jpg" }),
      slide(2, { mediaType: "VIDEO", mediaUrl: "https://cdn.test/two.mp4", posterImageUrl: "https://cdn.test/two.jpg" }),
    ];

    beforeEach(() => {
      // jsdom implements neither; the component only needs them not to throw.
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    });

    it("preloads only metadata for the next video, and plays only the current one", () => {
      const { container } = setup(VIDEOS);
      tick(3000);

      const [first, second] = Array.from(container.querySelectorAll("video"));
      expect(first).toHaveAttribute("preload", "auto");
      expect(first.autoplay).toBe(true);
      expect(second).toHaveAttribute("preload", "metadata");
      expect(second.autoplay).toBe(false);
      expect(second).toHaveAttribute("poster", "https://cdn.test/two.jpg");
    });

    it("advances on the current video's own ended event", () => {
      const { container } = setup(VIDEOS);

      fireEvent.ended(container.querySelector("video")!);
      expect(current()).toBe(1);
    });

    it("ignores a video's ended event once it has gone under the window", () => {
      const { container } = setup(VIDEOS);
      tick(3000);

      const [first] = Array.from(container.querySelectorAll("video"));
      fireEvent.click(railButtons()[1]);
      tick(1600);

      // Slide two is on screen and slide one is back to being `next` (there
      // are only two). Had its ended handler still been live, this would
      // have moved on to slide one again.
      fireEvent.ended(first);
      expect(current()).toBe(1);
    });

    it("parks a video that has been left mid-way at the start when it goes back to next", () => {
      // Clicked away from at 3s of 10s: the layer under the window keeps
      // playing, and comes back round as `next`. Without a reset, its turn
      // would resume at 3s instead of starting over.
      const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
      const seek = vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set");
      const { container } = setup(VIDEOS);
      tick(3000);
      pause.mockClear();
      seek.mockClear();

      fireEvent.click(railButtons()[1]);
      const [first] = Array.from(container.querySelectorAll("video"));
      expect(pause).not.toHaveBeenCalled(); // still under the window: keep playing

      tick(1600);
      expect(first.isConnected).toBe(true);
      expect(pause).toHaveBeenCalledTimes(1);
      expect(seek).toHaveBeenCalledWith(0);
    });

    it("starts the video that has just become current", () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      setup(VIDEOS);
      tick(3000);
      play.mockClear();

      fireEvent.click(railButtons()[1]);
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  describe("under prefers-reduced-motion", () => {
    beforeEach(() => media({ reduced: true, wide: true }));

    it("changes slide instantly, with no lock and no frame", () => {
      const { container } = setup();

      fireEvent.click(railButtons()[1]);
      expect(current()).toBe(1);
      fireEvent.click(railButtons()[2]);
      expect(current()).toBe(2);

      expect(container.querySelector("[class*='rgba(243,213,179,0.95)']")).toBeNull();
    });

    it("swaps the copy immediately rather than after the fade", () => {
      const { container } = setup();

      fireEvent.click(railButtons()[1]);
      expect(headline(container)).toHaveTextContent("Second caption");
      expect(container.querySelector("[data-phase]")).toHaveAttribute("data-phase", "in");
    });

    it("still auto-advances, on a timer", () => {
      // Without this it never did: the bar's animationend is what advanced an
      // image slide, and the global reduced-motion rule shrinks that
      // animation to nothing before it can end.
      setup([slide(1, { durationSeconds: 3 }), slide(2, { durationSeconds: 3 }), slide(3)]);

      tick(2900);
      expect(current()).toBe(0);
      tick(200);
      expect(current()).toBe(1);
      tick(3000);
      expect(current()).toBe(2);
    });

    it("does not also advance on the bar's animationend", () => {
      setup();
      const bar = railButtons()[0].querySelector("span[aria-hidden] > span")!;

      fireEvent.animationEnd(bar);
      expect(current()).toBe(0);
    });

    it("renders neither the dust canvas nor the glint", () => {
      const { container } = setup();

      expect(container.querySelector("canvas")).toBeNull();
      expect(container.querySelector("[style*='hero-glint']")).toBeNull();
    });
  });

  describe("the decoration", () => {
    const cores = (n: number) =>
      vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(n);

    it("draws the dust only on a wide screen with more than four cores", () => {
      media({ wide: true });
      cores(8);
      const { container, unmount } = setup();
      expect(container.querySelector("canvas")).not.toBeNull();
      unmount();

      media({ wide: true });
      cores(4);
      const four = setup();
      expect(four.container.querySelector("canvas")).toBeNull();
      four.unmount();

      media({ wide: false });
      cores(16);
      const narrow = setup();
      expect(narrow.container.querySelector("canvas")).toBeNull();
    });

    it("renders the glint as a transform-animated strip, with no blend mode", () => {
      const { container } = setup();
      const glint = container.querySelector<HTMLElement>("[style*='hero-glint']")!;

      expect(glint).not.toBeNull();
      expect(glint.style.animation).toContain("7s");
      expect(glint.style.mixBlendMode).toBe("");
      expect(glint.closest("[aria-hidden]")).not.toBeNull();
    });

    it("is all aria-hidden and unclickable", () => {
      media({ wide: true });
      cores(8);
      const { container } = setup();

      for (const el of [
        container.querySelector("canvas")!,
        container.querySelector("[style*='hero-glint']")!.parentElement!,
      ]) {
        expect(el).toHaveAttribute("aria-hidden");
        expect(el).toHaveClass("pointer-events-none");
      }
    });

    it("shows the scroll cue for up to three slides and not for four", () => {
      const three = setup();
      expect(screen.getByText("Scroll")).toBeInTheDocument();
      three.unmount();

      setup([1, 2, 3, 4].map((n) => slide(n)));
      expect(screen.queryByText("Scroll")).not.toBeInTheDocument();
    });

    describe("the dust loop", () => {
      let observe: (isIntersecting: boolean) => void;
      let clearRect: ReturnType<typeof vi.fn>;
      let arc: ReturnType<typeof vi.fn>;
      const RealObserver = window.IntersectionObserver;

      beforeEach(() => {
        media({ wide: true });
        cores(8);

        // An observer that reports what the test tells it to, in place of
        // tests/setup.ts's inert one. Only the hero's own is driven: next/link
        // makes observers of its own (rootMargin, for prefetching), and the
        // hero asks for `threshold: 0`.
        const heroCallbacks: IntersectionObserverCallback[] = [];

        class Observer {
          constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            if (options?.threshold === 0) heroCallbacks.push(callback);
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        }
        window.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
        observe = (isIntersecting) =>
          heroCallbacks.forEach((cb) =>
            cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
          );

        clearRect = vi.fn();
        arc = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
          clearRect,
          arc,
          beginPath: vi.fn(),
          fill: vi.fn(),
          fillStyle: "",
          globalAlpha: 1,
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1920);
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
      });

      afterEach(() => {
        window.IntersectionObserver = RealObserver;
      });

      it("draws at most 70 motes a frame", () => {
        setup();
        tick(100);

        expect(clearRect).toHaveBeenCalled();
        expect(arc.mock.calls.length / clearRect.mock.calls.length).toBe(70);
      });

      it("stops when the hero scrolls out of view, and resumes when it returns", () => {
        setup();
        tick(100);
        expect(clearRect.mock.calls.length).toBeGreaterThan(0);

        act(() => observe(false));
        const frozen = clearRect.mock.calls.length;
        tick(500);
        expect(clearRect.mock.calls.length).toBe(frozen);

        act(() => observe(true));
        tick(100);
        expect(clearRect.mock.calls.length).toBeGreaterThan(frozen);
      });

      it("pauses the glint and the scroll cue's drip alongside it", () => {
        const { container } = setup();
        const glint = container.querySelector<HTMLElement>("[style*='hero-glint']")!;
        const drip = container.querySelector<HTMLElement>("[style*='hero-scroll-drip']")!;

        expect(glint.style.animationPlayState).toBe("running");

        act(() => observe(false));
        expect(glint.style.animationPlayState).toBe("paused");
        expect(drip.style.animationPlayState).toBe("paused");
      });

      it("stops when the tab is hidden", () => {
        setup();
        tick(100);

        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        act(() => {
          document.dispatchEvent(new Event("visibilitychange"));
        });
        const frozen = clearRect.mock.calls.length;
        tick(500);
        expect(clearRect.mock.calls.length).toBe(frozen);

        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        act(() => {
          document.dispatchEvent(new Event("visibilitychange"));
        });
        tick(100);
        expect(clearRect.mock.calls.length).toBeGreaterThan(frozen);
      });

      it("stops for good on unmount", () => {
        const { unmount } = setup();
        tick(100);

        unmount();
        const frozen = clearRect.mock.calls.length;
        tick(500);
        expect(clearRect.mock.calls.length).toBe(frozen);
      });
    });
  });
});
