import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Self-hosted to avoid flaky Google Fonts fetches in CI. */
const display = localFont({
  src: [
    { path: "./fonts/syne-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/syne-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/syne-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/syne-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "./fonts/manrope-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/manrope-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/manrope-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cortely — Agendamento e fidelidade para barbearias",
  description:
    "SaaS de agendamento web ultrarrápido com vitrine visual, WhatsApp e Barber Points.",
  applicationName: "Cortely",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${display.variable} ${sans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
