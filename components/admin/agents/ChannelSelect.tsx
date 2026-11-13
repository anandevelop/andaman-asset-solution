"use client";

/**
 * components/admin/agents/ChannelSelect.tsx — the registration-channel
 * filter on the co-agent list. One native select in place of a chip per
 * sales person; choosing an option goes to the URL the page built for it,
 * so the search text and the other filter are kept.
 */

import { useRouter } from "next/navigation";

type Option = { value: string; label: string; href: string };

export default function ChannelSelect({ label, value, options }: { label: string; value: string; options: Option[] }) {
  const router = useRouter();
  return (
    <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border border-adm-line-strong bg-adm-panel pl-3 text-[13px] text-adm-muted focus-within:border-adm-info">
      {label}
      <select
        value={options.some((option) => option.value === value) ? value : "all"}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) router.push(next.href, { scroll: false });
        }}
        className="min-h-[36px] cursor-pointer rounded-[10px] bg-transparent pr-2 text-[13px] font-medium text-adm-text outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
