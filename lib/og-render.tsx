/**
 * lib/og-render.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The one place that builds an OG card, shared by all five
 * opengraph-image.tsx files (home, projects/[slug], news/[slug],
 * events/[slug], e-brochure/[slug]) so the layout, palette and font
 * handling live once rather than five times.
 *
 * FONTS ARE LOCAL FILES, NOT next/font
 *
 * next/font/local (used by app/[locale]/layout.tsx for the same two
 * families) optimises and renames its output for the browser; there is no
 * supported way to read the bytes back out of it. ImageResponse instead
 * wants each font as a raw ArrayBuffer, so this file reads the same .ttf
 * files directly off disk with node:fs.
 *
 * TWO FONT FAMILIES, PICKED BY LOCALE, NOT FOUR
 *
 * FC Vision (fonts/fc-vision/) covers Thai and Latin, exactly the site's
 * own th-locale choice in the root layout — used here for `locale: "th"`.
 * Every other locale uses Roboto — specifically the static build fetched
 * from Google Fonts into fonts/roboto/ (see its own LICENSE.txt), which
 * covers Latin *and Cyrillic* in one file, unlike the latin/latin-ext-only
 * subset next/font/google loads for the rest of the site. That closes the
 * gap for genuinely Cyrillic `ru` content.
 *
 * It does not close the gap for Chinese: no CJK font is bundled here, and
 * adding one (several megabytes, its own license to track) is a bigger
 * decision than this feature justifies on its own. In practice this rarely
 * bites — project names, locations and news categories in this dataset
 * stay in Latin script even on their zh rows (real estate branding is
 * usually kept as-is across markets) — but a zh translation that genuinely
 * used Chinese characters in one of those fields would render as blank
 * boxes here. Card *chrome* (the eyebrow labels this file itself writes)
 * is kept in English for every non-Thai locale specifically to avoid ever
 * needing that coverage for text this file controls.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { Locale } from "@/i18n";

export const OG_SIZE = { width: 1200, height: 630 } as const;

const NAVY = "#083551";
const SAND = "#e8b384";

type Assets = {
  fcVisionRegular: ArrayBuffer;
  fcVisionBold: ArrayBuffer;
  robotoRegular: ArrayBuffer;
  robotoBold: ArrayBuffer;
  logoDataUrl: string;
};

let cached: Assets | null = null;

async function fontBuffer(relativePath: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path.join(process.cwd(), relativePath));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/** Loaded once per server instance/build worker, not once per card. */
async function loadAssets(): Promise<Assets> {
  if (cached) return cached;

  const [fcVisionRegular, fcVisionBold, robotoRegular, robotoBold, logoBytes] = await Promise.all([
    fontBuffer("fonts/fc-vision/FCVision-Regular.ttf"),
    fontBuffer("fonts/fc-vision/FCVision-Bold.ttf"),
    fontBuffer("fonts/roboto/Roboto-Regular.ttf"),
    fontBuffer("fonts/roboto/Roboto-Bold.ttf"),
    readFile(path.join(process.cwd(), "public/logo-white.png")),
  ]);

  cached = {
    fcVisionRegular,
    fcVisionBold,
    robotoRegular,
    robotoBold,
    logoDataUrl: `data:image/png;base64,${logoBytes.toString("base64")}`,
  };
  return cached;
}

export type OgCardProps = {
  locale: Locale;
  /** Short, uppercase kicker — a location, a category, a formatted date.
   *  Card chrome the caller writes in English for non-Thai locales; see
   *  this file's header. */
  eyebrow?: string;
  title: string;
  /** Hero/cover photo, used as a full-bleed background under a navy
   *  gradient. Null renders a flat navy card, same as the site's static
   *  fallback (public/og-image.jpg) used to be for every page. */
  backgroundImageUrl?: string | null;
};

export async function renderOgCard({
  locale,
  eyebrow,
  title,
  backgroundImageUrl,
}: OgCardProps): Promise<ImageResponse> {
  const assets = await loadAssets();
  const fontFamily = locale === "th" ? "FC Vision" : "Roboto";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: NAVY,
          fontFamily,
        }}
      >
        {backgroundImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- Satori
             renders its own image pipeline; next/image does not apply here. */
          <img
            src={backgroundImageUrl}
            alt=""
            width={OG_SIZE.width}
            height={OG_SIZE.height}
            style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
          />
        )}

        {/*
          Legible over either a photo or the flat navy fallback — on the
          flat case this just deepens the navy slightly throughout.

          Strong and fairly uniform rather than a light top-to-dark-bottom
          fade: a hero/cover photo in this library is often itself a
          finished marketing graphic with its own baked-in headline (a
          news article's cover, for one), and a subtle fade left that
          competing text fully legible behind this card's own title. A
          heavier, flatter scrim suppresses it everywhere the card's own
          text might land, at the cost of the photo reading more as a
          backdrop than a subject — the right trade for a card whose job
          is the headline, not the photo.

          Explicit top/left/width/height, not `inset: 0`: Satori does not
          resolve the `inset` shorthand, so a div positioned with it alone
          computes to zero size and paints nothing — confirmed by an
          isolated repro (a lone gradient div, `inset: 0`, over a solid
          background: the background rendered, the gradient never did,
          byte-identical output across edits to the gradient itself until
          this was the fix). `backgroundImage`, not the `background`
          shorthand, for the same reason one property over — Satori
          resolves gradients through the longhand only.
        */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: OG_SIZE.width,
            height: OG_SIZE.height,
            display: "flex",
            backgroundImage:
              "linear-gradient(0deg, rgba(8,53,81,0.97) 0%, rgba(8,53,81,0.9) 55%, rgba(8,53,81,0.62) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: "100%",
            padding: "64px 76px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assets.logoDataUrl}
            alt=""
            width={230}
            height={31}
            style={{ marginBottom: 44 }}
          />

          {eyebrow && (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: SAND,
                marginBottom: 18,
              }}
            >
              {eyebrow}
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.15,
              color: "#ffffff",
              maxWidth: 980,
            }}
          >
            {title}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "FC Vision", data: assets.fcVisionRegular, weight: 400, style: "normal" },
        { name: "FC Vision", data: assets.fcVisionBold, weight: 700, style: "normal" },
        { name: "Roboto", data: assets.robotoRegular, weight: 400, style: "normal" },
        { name: "Roboto", data: assets.robotoBold, weight: 700, style: "normal" },
      ],
    },
  );
}

/**
 * For the one genuine manual override in the schema — Project.ogImageUrl,
 * the SEO tab's escape hatch for a hero photo that crops badly. Passed
 * through byte-for-byte rather than redrawn: an admin who picked a
 * specific image for this exact purpose gets that image, not this file's
 * opinion about it.
 */
export async function passThroughImage(url: string): Promise<Response> {
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    throw new Error(`og image passthrough failed: ${upstream.status} ${url}`);
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
