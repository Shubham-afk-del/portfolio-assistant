import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, Source_Serif_4 } from "next/font/google";
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

/* One italic word per headline, in a face made for display sizes. A single
 * weight and style, so it costs one small file. */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-display-italic",
  display: "swap",
});

/**
 * The absolute origin the share image and canonical URL are built on. A
 * custom domain goes in NEXT_PUBLIC_SITE_URL. Without one, a Vercel build uses
 * the project's production domain, which Vercel provides at build time, so a
 * link shared on LinkedIn never previews an image from localhost. An empty
 * value counts as unset.
 */
const VERCEL_DOMAIN = process.env["VERCEL_PROJECT_PRODUCTION_URL"];
const SITE_URL =
  process.env["NEXT_PUBLIC_SITE_URL"] ||
  (VERCEL_DOMAIN ? `https://${VERCEL_DOMAIN}` : "http://localhost:3000");

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
  // 100dvh column rather than sitting under a fixed bottom bar, so the mobile
  // keyboard opening does not shift the layout.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#070a10" },
  ],
};

/**
 * Runs during HTML parsing, before first paint, so the page never flashes the
 * wrong theme. Three jobs: set data-theme from the stored choice or else the
 * system preference, restore a stored "pause motion" choice, and switch the
 * entrance animations on only when they can be seen. A tab opened in the
 * background would otherwise sit on frame zero of every entrance, with the
 * content invisible until it was focused.
 */
const BOOT = `(function(){try{var d=document.documentElement,s=null,m=null;try{s=localStorage.getItem("theme");m=localStorage.getItem("motion")}catch(e){}d.dataset.theme=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(m==="paused")d.dataset.motion="paused";if(document.visibilityState==="visible"&&!matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.entrance=""}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The boot script writes data-theme, data-motion and data-entrance before
    // React hydrates, so those attributes legitimately differ from the server.
    <html
      lang="en-GB"
      className={`${inter.variable} ${sourceSerif.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
