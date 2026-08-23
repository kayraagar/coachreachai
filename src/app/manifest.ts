import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CoachReachAI",
    short_name: "CoachReachAI",
    description:
      "Haftalık görüşme ajandası, canlı çalışma takibi, deneme netleri ve rutin analizi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfbf9",
    theme_color: "#635bff",
    lang: "tr",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Soru girişi", url: "/ogrenci/soru-girisi" },
      { name: "Görüşmeler", url: "/ogrenci/gorusmeler" },
      { name: "Rutinler", url: "/ogrenci/rutinler" },
    ],
  };
}
