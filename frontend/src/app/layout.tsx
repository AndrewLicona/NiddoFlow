import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#2563eb",
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: {
    default: "NiddoFlow | Finanzas Familiares en Armonía",
    template: "%s | NiddoFlow",
  },
  description: "Gestiona tus ingresos, gastos y ahorros en familia con NiddoFlow. La plataforma más intuitiva para el control financiero compartido de tu hogar.",
  keywords: ["finanzas familiares", "control de gastos", "ahorro en familia", "presupuesto compartido", "gestión financiera", "Colombia", "NiddoFlow"],
  authors: [{ name: "Andrew Licona" }],
  creator: "Andrew Licona",
  publisher: "NiddoFlow",
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "https://niddoflow.vercel.app",
    siteName: "NiddoFlow",
    title: "NiddoFlow | Finanzas Familiares en Armonía",
    description: "La forma más inteligente de gestionar el dinero en familia.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "NiddoFlow Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NiddoFlow | Finanzas Familiares en Armonía",
    description: "Gestiona tus finanzas familiares sin complicaciones.",
    images: ["/og-image.png"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NiddoFlow",
  },
};

import { PWAProvider } from "@/components/providers/PWAProvider";
import MainLayout from "@/components/providers/MainLayout";
import QueryProvider from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ColorPaletteProvider } from "@/components/providers/ColorPaletteProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <PWAProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem themes={['light', 'dark']}>
              <ColorPaletteProvider>
                <MainLayout>
                  {children}
                </MainLayout>
              </ColorPaletteProvider>
            </ThemeProvider>
          </PWAProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
