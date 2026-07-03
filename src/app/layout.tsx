import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { BRAND } from "@/lib/constants";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";
import { InstallAppBanner } from "@/components/pwa/InstallAppBanner";
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
    statusBarStyle: "black-translucent",
    title: "FILA LSL",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
      <body className={`${inter.variable} antialiased`}>
        {children}
        <PwaRegistrar />
        <InstallAppBanner />
      </body>
    </html>
  );
}
