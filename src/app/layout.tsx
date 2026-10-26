import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "BANKRcrm",
  description: "BANKRcrm — community and support workspace",
  // Installable app (iPhone needs Add to Home Screen for push). A static file: a generated
  // manifest route recompiles on every request in dev and reload-loops the page.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BANKRcrm", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#1A1A1A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
