import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { BRAND } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FILA LSL - Controle de Descarregamento",
  description: "Sistema de check-in e fila de descarregamento — PAD SIF",
  manifest: "/manifest.json",
  applicationName: "FILA LSL",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FILA LSL",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: BRAND.primary,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
