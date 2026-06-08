import type { Metadata, Viewport } from "next";
import { VT323, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { MatrixRain } from "@/components/MatrixRain";
import { ScanlinesOverlay } from "@/components/ScanlinesOverlay";
import { GrainOverlay } from "@/components/GrainOverlay";

import "./globals.css";

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SQLI ⟁ STRIKER",
  description: "Tactical SQL injection strike platform",
  applicationName: "sqli-striker",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" className={`${vt323.variable} ${jbmono.variable}`}>
      <body className="min-h-screen relative overflow-x-hidden">
        <MatrixRain />
        {children}
        <GrainOverlay />
        <ScanlinesOverlay />
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors={false}
          closeButton
          toastOptions={{
            style: {
              background: "rgba(10,0,0,0.92)",
              color: "#f5f0e8",
              border: "1px solid #8b0000",
              borderRadius: 0,
              fontFamily: "var(--font-jbmono), monospace",
              fontSize: "12px",
              letterSpacing: "0.05em",
              boxShadow: "0 0 24px rgba(255,0,51,0.25)",
            },
          }}
        />
      </body>
    </html>
  );
}
