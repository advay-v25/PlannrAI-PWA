import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "sonner";
import { ApiDiagnostics } from "@/components/debug/api-diagnostics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlannrAI - Build how you want to, adapt when you need to",
  description: "Build how you want to, adapt when you need to",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PlannrAI",
  },
  openGraph: {
    title: "PlannrAI",
    description: "Build how you want to, adapt when you need to",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f1419",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

import { GlobalInputSanitizer } from "@/components/GlobalInputSanitizer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased tracking-tight`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <GlobalInputSanitizer />
          <ToastProvider>
            {children}
            <ApiDiagnostics />
            <Toaster position="top-center" />
            <SpeedInsights />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
