/**
 * The installed portal's web-app manifest. Linked as
 * /<locale>/club/manifest.webmanifest on every host: a dotted path skips
 * the proxy, so on member.* a bare /manifest.webmanifest would be the
 * public site's (app/manifest.ts). start_url "/" is the portal home on
 * member.andamanassetsolution.com.
 */
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return NextResponse.json(
    {
      name: "ANDAMAN CLUB",
      short_name: "Andaman",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b0b0c",
      theme_color: "#0b0b0c",
      lang: locale,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" } },
  );
}
