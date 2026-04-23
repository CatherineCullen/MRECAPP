import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // Root metadata is rider-facing by default. The /chia/* admin layout
  // overrides `title` so those tabs read "CHIA" — useful when an admin has
  // both rider-side and admin-side tabs open at once.
  title: {
    default: "Marlboro Ridge Equestrian Center",
    template: "%s — Marlboro Ridge Equestrian Center",
  },
  description: "Marlboro Ridge Equestrian Center — lessons, boarding, and training.",
  openGraph: {
    title:       "Marlboro Ridge Equestrian Center",
    description: "Marlboro Ridge Equestrian Center — lessons, boarding, and training.",
    siteName:    "Marlboro Ridge Equestrian Center",
    type:        "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
