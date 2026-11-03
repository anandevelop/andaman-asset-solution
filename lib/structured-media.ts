/**
 * lib/structured-media.ts
 * ─────────────────────────────────────────────────────────────────────────
 * JSON-LD for the two kinds of media the site publishes besides photos:
 * the monthly construction videos (YouTube, on each project page) and the
 * e-brochure PDFs. Neither carried any structured data, so Google had no
 * VideoObject to show in video results and treated a brochure page as a
 * page with a frame in it.
 *
 * Pure, so the shapes can be tested without a page.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getYouTubeEmbedUrl } from "@/lib/youtube";
import { absoluteAssetUrl } from "@/lib/seo";
import { intlLocale } from "@/lib/format";

/** The 11-character id, from any link getYouTubeEmbedUrl accepts. */
export function youTubeId(videoUrl: string | null | undefined): string | null {
  const embed = getYouTubeEmbedUrl(videoUrl);
  return embed ? (embed.split("/").pop() ?? null) : null;
}

type ProgressVideoInput = {
  locale: string;
  projectName: string;
  pageUrl: string;
  updates: readonly { id: string; year: number; month: number; videoUrl: string | null }[];
};

/**
 * One VideoObject per month that has a YouTube link. uploadDate is the
 * first of that month — the month the footage is filed under, which is
 * as precise as the row knows. Google requires name, thumbnailUrl and
 * uploadDate; the thumbnail is YouTube's own still for the video.
 */
export function progressVideoObjects({ locale, projectName, pageUrl, updates }: ProgressVideoInput) {
  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" });

  return updates.flatMap((update) => {
    const id = youTubeId(update.videoUrl);
    if (!id) return [];
    const date = new Date(Date.UTC(update.year, update.month - 1, 1));
    const name = `${projectName} — ${monthLabel.format(date)}`;
    return [
      {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "@id": `${pageUrl}#video-${update.id}`,
        name,
        description: name,
        thumbnailUrl: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`],
        uploadDate: date.toISOString().slice(0, 10),
        embedUrl: `https://www.youtube.com/embed/${id}`,
        url: `https://www.youtube.com/watch?v=${id}`,
        inLanguage: intlLocale(locale),
        isPartOf: { "@id": pageUrl },
      },
    ];
  });
}

type BrochureInput = {
  locale: string;
  pageUrl: string;
  title: string;
  description: string | null;
  fileUrl: string;
  coverImageUrl: string | null;
  updatedAt: Date;
  projectName: string | null;
  publisherName: string;
  publisherUrl: string;
};

/** The brochure as what it is: a PDF, about one development, by the company. */
export function brochureDocument(input: BrochureInput) {
  const cover = absoluteAssetUrl(input.coverImageUrl);
  return {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    "@id": `${input.pageUrl}#brochure`,
    name: input.title,
    ...(input.description && { description: input.description }),
    url: input.pageUrl,
    encodingFormat: "application/pdf",
    contentUrl: absoluteAssetUrl(input.fileUrl) || undefined,
    ...(cover && { image: cover, thumbnailUrl: cover }),
    dateModified: input.updatedAt.toISOString(),
    inLanguage: intlLocale(input.locale),
    ...(input.projectName && { about: { "@type": "Residence", name: input.projectName } }),
    publisher: { "@type": "Organization", name: input.publisherName, url: input.publisherUrl },
  };
}
