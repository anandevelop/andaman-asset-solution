"use client";

/**
 * components/admin/FormSectionNav.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A jump list for a long form: one row per section, the one on screen
 * highlighted, a click scrolls to it. Drawn beside the form on wide
 * screens and not at all below `xl`, where there is no room for a third
 * column and the form is short enough per screen to scroll.
 *
 * The form owns its sections; this only needs their element ids. Each
 * section should carry `scroll-mt-20` so the sticky topbar does not cover
 * its heading after a jump.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";

export type FormSection = { id: string; label: string };

export default function FormSectionNav({ sections, label }: { sections: FormSection[]; label: string }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    // "Active" = the section whose top most recently crossed the upper
    // third of the viewport, which is where the eye is while reading.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-64px 0px -60% 0px" },
    );

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label} className="sticky top-[68px] hidden flex-col gap-0.5 self-start xl:flex">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            setActive(section.id);
          }}
          aria-current={active === section.id ? "true" : undefined}
          className={[
            "flex h-8 items-center rounded-[6px] px-2.5 text-[12.5px] transition-colors",
            active === section.id
              ? "bg-surface-raised font-medium text-ink shadow-[0_1px_2px_rgba(8,53,81,0.08)] ring-1 ring-primary/10"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          ].join(" ")}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
