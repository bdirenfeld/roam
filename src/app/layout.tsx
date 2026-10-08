import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ui/ServiceWorkerRegistrar";
import SessionRecorder from "@/components/ui/SessionRecorder";
import { materialFontUrl } from "@/lib/mapPins";

export const metadata: Metadata = {
  title: "Roam",
  description: "Your personal travel itinerary",
  manifest: "/manifest.json",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1A1A2E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DM Sans — body font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Material Symbols — only Roam's glyphs and axis values (lib/mapPins
            materialFontUrl): ~20 KB instead of 4 MB (3 Oct 2026). */}
        <link href={materialFontUrl()} rel="stylesheet" />
      </head>
      <body className="antialiased bg-parchment text-gray-900">
        <ServiceWorkerRegistrar />
        <SessionRecorder />
        {children}
      </body>
    </html>
  );
}
