"use client";

/**
 * components/admin/HomePreview.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The live home page beside the section list, as a desktop or a phone.
 *
 * The real route in an iframe, not a mockup — a saved reorder or switch
 * shows on its next load (every home action revalidates `/`). Desktop is
 * rendered at 1280px and scaled down to the card, because an iframe the
 * card's own width (~450px) would show the phone layout and call it the
 * desktop one. The phone is 390px, centred, scaled only if the card is
 * narrower than that.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import Segmented from "@/components/admin/ui/Segmented";

const WIDTH = { desktop: 1280, phone: 390 } as const;
/* Desktop is drawn ~1/3 size, so it gets a taller page to show the same
   card height as the phone: the banner and the first few bands, not the
   banner alone. */
const HEIGHT = { desktop: 1800, phone: 720 } as const;

export default function HomePreview({
  src,
  labels,
}: {
  src: string;
  labels: { title: string; hint: string; device: string; desktop: string; phone: string };
}) {
  const [device, setDevice] = useState<keyof typeof WIDTH>("desktop");
  const [frameWidth, setFrameWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const width = WIDTH[device];
  const height = HEIGHT[device];
  const scale = frameWidth > 0 ? Math.min(1, frameWidth / width) : 1;

  return (
    <section className="admin-card flex flex-col p-0! xl:sticky xl:top-[78px]">
      <div className="flex items-center justify-between gap-3 border-b border-adm-line px-[18px] py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-adm-text">{labels.title}</h2>
          <p className="truncate text-xs text-adm-muted">{labels.hint}</p>
        </div>
        <Segmented
          label={labels.device}
          active={device}
          onSelect={(key) => setDevice(key as keyof typeof WIDTH)}
          items={[
            { key: "desktop", label: labels.desktop, icon: Monitor },
            { key: "phone", label: labels.phone, icon: Smartphone },
          ]}
        />
      </div>
      <div ref={boxRef} className="overflow-hidden bg-adm-text/4 p-3" style={{ height: height * scale + 24 }}>
        <div
          className="mx-auto overflow-hidden rounded-[10px] border border-adm-line bg-white"
          style={{ width: width * scale, height: height * scale }}
        >
          <iframe
            src={src}
            title={labels.title}
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            className="border-0"
          />
        </div>
      </div>
    </section>
  );
}
