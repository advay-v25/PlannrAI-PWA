import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "sonner";
import { ApiDiagnostics } from "@/components/debug/api-diagnostics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "PlannrAI - Build when you want, adapt when you need",
  description: "Build when you want, adapt when you need",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PlannrAI",
  },
  openGraph: {
    title: "PlannrAI",
    description: "Build when you want, adapt when you need",
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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className="font-sans antialiased tracking-tight"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="plannrai-theme"
        >
          <GlobalInputSanitizer />
          <ToastProvider>
            {children}
            <ApiDiagnostics />
            <Toaster
              position="top-center"
              theme="system"
              richColors
              closeButton
              visibleToasts={3}
              className="!top-4"
              toastOptions={{
                classNames: {
                  toast: "!bg-[var(--glass-bg)] !border-[var(--glass-border)] !text-[var(--text-primary)] !shadow-lg backdrop-blur-xl",
                  success: "!bg-[var(--color-success)]/15 !border-[var(--color-success)]/30 !text-[var(--color-success)]",
                  error: "!bg-[var(--color-error)]/15 !border-[var(--color-error)]/30 !text-[var(--color-error)]",
                  warning: "!bg-[var(--color-warning)]/15 !border-[var(--color-warning)]/30 !text-[var(--color-warning)]",
                  info: "!bg-[var(--color-primary)]/15 !border-[var(--color-primary)]/30 !text-[var(--color-primary)]",
                  closeButton: "!bg-[var(--glass-bg)] !text-[var(--text-tertiary)] hover:!text-[var(--text-primary)]",
                },
              }}
            />
            <SpeedInsights />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
