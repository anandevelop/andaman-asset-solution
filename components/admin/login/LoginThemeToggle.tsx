"use client";

/**
 * components/admin/login/LoginThemeToggle.tsx — light/dark on the sign-in
 * page. The back office's own preference (applyDisplayPref "theme"), so a
 * choice made here is the one the back office opens in, and the reverse.
 */

import { Moon, Sun } from "lucide-react";
import { applyDisplayPref, useDisplayPref } from "@/lib/admin/use-display-pref";

export default function LoginThemeToggle({ labels }: { labels: { dark: string; light: string } }) {
  const theme = useDisplayPref("theme");
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => applyDisplayPref("theme", dark ? "light" : "dark")}
      aria-pressed={dark}
      title={dark ? labels.light : labels.dark}
      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 text-white/85 transition-colors hover:bg-white/10"
    >
      {dark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
      <span className="sr-only">{dark ? labels.light : labels.dark}</span>
    </button>
  );
}
