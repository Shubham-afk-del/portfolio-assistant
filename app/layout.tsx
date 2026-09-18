import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

const SITE_URL = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

const DESCRIPTION =
  "A retrieval-grounded assistant that answers questions about one engineer's work, where every claim traces to a source document.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Ask about Shubham Kumar Singh",
  description: DESCRIPTION,
  openGraph: {
    title: "Ask about Shubham Kumar Singh",
    description: DESCRIPTION,
    type: "website",
    locale: "en_GB",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Safe-area insets are used by the composer; the transcript scrolls inside a
  // 100dvh flex column rather than sitting under a fixed bottom bar, so the
  // mobile keyboard opening does not shift the layout.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
