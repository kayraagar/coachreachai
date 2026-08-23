import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ui/ServiceWorker";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "YKS Koçluk",
    template: "%s · YKS Koçluk",
  },
  description:
    "Haftalık görüşme ajandası, canlı çalışma takibi, deneme netleri ve rutin analizi ile öğrenci–koç paneli",
  applicationName: "YKS Koçluk",
  appleWebApp: {
    capable: true,
    title: "YKS Koçluk",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "YKS Koçluk",
    title: "YKS Koçluk",
    description: "Öğrenci ve koç için canlı çalışma takibi ve haftalık görüşme ajandası",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#191a20" },
  ],
};

/** Tema, ilk boyamadan önce uygulanır — böylece geçişte beyaz parlama olmaz. */
const themeScript = `(function(){try{var t=localStorage.getItem('yks-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
