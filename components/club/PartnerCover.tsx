/**
 * components/club/PartnerCover.tsx — a partner's cover photo, or its
 * category icon on black when there is none. A CSS background, so a slow
 * or missing image never shifts the layout.
 */
import type { ReactNode } from "react";
import CategoryIcon from "./CategoryIcon";

type Props = { image: string | null; category: string; iconSize?: number; className?: string; children?: ReactNode };

export default function PartnerCover({ image, category, iconSize = 28, className = "", children }: Props) {
  return (
    <span
      className={`relative grid place-items-center overflow-hidden bg-[radial-gradient(120%_100%_at_20%_0%,#2a2b2e,#111_60%)] bg-cover bg-center text-champagne-300 ${className}`}
      style={image ? { backgroundImage: `linear-gradient(180deg,transparent 45%,rgb(0 0 0/.55)),url(${JSON.stringify(image)})` } : undefined}
    >
      {image ? null : <CategoryIcon category={category} size={iconSize} />}
      {children}
    </span>
  );
}
