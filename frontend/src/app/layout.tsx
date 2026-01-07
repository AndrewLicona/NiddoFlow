import type { Metadata } from "next";
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

export const metadata: Metadata = {
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
};

import { Navigation } from "@/components/ui/organisms/Navigation";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#F8FAFC] min-h-screen mb-20 md:mb-0 md:pl-20`}
      >
        <Navigation />
        {children}
      </body>
    </html>
  );
}
