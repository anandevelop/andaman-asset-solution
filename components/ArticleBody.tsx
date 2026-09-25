/**
 * components/ArticleBody.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * An article's rendered body, with the one block that cannot survive as
 * HTML swapped for a real component: the project card (Phase 2b-5.3).
 *
 * The body arrives already sanitized — lib/markdown.ts does that on save
 * and again on render — and already anchored. This only decides where the
 * string is interrupted; see lib/article-embeds.ts for why the split
 * returns segments instead of splicing HTML together.
 *
 * THE FAST PATH IS THE POINT, NOT AN OPTIMISATION
 *
 * A body with no project card returns exactly one html segment and renders
 * one `.prose-article` div holding all of it — the same single element the
 * news page rendered before this component existed. That matters because
 * prose-article spaces its children with `& > * + *`: had every article
 * been split into wrapper divs, the gaps between paragraphs inside each
 * wrapper would have collapsed. Every article written so far takes this
 * path, and takes it without querying for projects at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import FeaturedProjectCard from "@/components/FeaturedProjectCard";
import { splitArticleEmbeds } from "@/lib/article-embeds";
import { getPublishedProjects } from "@/lib/projects";
import { projectCtaKey, projectSignalLabel } from "@/lib/project-card-labels";

type Props = {
  /** Sanitized HTML — see the header. */
  html: string;
  locale: string;
};

export default async function ArticleBody({ html, locale }: Props) {
  const segments = splitArticleEmbeds(html);

  if (segments.length === 1 && segments[0].kind === "html") {
    return <div className="prose-article" dangerouslySetInnerHTML={{ __html: segments[0].html }} />;
  }

  const [projects, tProjects] = await Promise.all([
    // cache()d and unfiltered, so this is the same query the footer's
    // "Developments" column already makes on this render — React dedupes
    // the two. Reading the full list rather than one project per slug also
    // means an article with three cards still costs one query.
    getPublishedProjects(locale),
    getTranslations("projects"),
  ]);
  const bySlug = new Map(projects.map((project) => [project.slug, project]));

  return (
    <div className="space-y-6">
      {segments.map((segment, index) => {
        const project = segment.kind === "projectCard" ? bySlug.get(segment.slug) : undefined;

        // Unresolved on purpose rather than dropped: the slug names a
        // project that is unpublished, deleted or renamed, and the block's
        // own markup is already a link to it. A reader gets that link; the
        // author gets something visibly wrong to fix, instead of a silent
        // hole where a card used to be.
        if (!project) {
          return (
            <div
              key={index}
              className="prose-article"
              dangerouslySetInnerHTML={{ __html: segment.html }}
            />
          );
        }

        return (
          <FeaturedProjectCard
            key={index}
            project={project}
            locale={locale}
            // One card in a one-column article measure, not a cell in a
            // three-up grid — so it is never a third of the viewport.
            sizes="(max-width: 768px) 100vw, 42rem"
            labels={{
              status: tProjects(`status.${project.status}` as never),
              cta: tProjects(projectCtaKey(project.status) as never),
              specVillas: tProjects("specs.villas"),
              specBedrooms: tProjects("specs.bedrooms"),
              specLand: tProjects("specs.land"),
              signal: projectSignalLabel(project.signal, tProjects as never, locale),
            }}
          />
        );
      })}
    </div>
  );
}
