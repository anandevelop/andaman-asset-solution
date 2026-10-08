"use client";
/**
 * components/club/useOnline.ts — navigator.onLine as a hook. The server
 * snapshot is "online", so the offline UI only ever appears after
 * hydration and never causes a mismatch.
 */
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
