import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { APP_NAME, BRAND } from "@/lib/constants";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";
import { InstallAppBanner } from "@/components/pwa/InstallAppBanner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${APP_NAME} - Filas e Docas`,
  description: "Controle de filas, check-in e operação logística em tempo real.",
  manifest: "/manifest.json",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
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
