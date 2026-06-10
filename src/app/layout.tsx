import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bankr DevRel Intake",
  description: "Developer-relations intake CRM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
