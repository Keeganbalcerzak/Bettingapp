import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Nav, NavFallback } from "@/components/Nav";
import { SlipDock } from "@/components/SlipDock";
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
  title: "ParlayLab",
  description: "Find +EV FanDuel bets and build smarter parlays using sharp odds, injuries, form, weather and player game logs.",
  // Served from public/ on purpose: an app/icon.svg file sends next dev into a reload loop.
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<NavFallback />}>
          <Nav />
        </Suspense>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-line mt-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-xs text-ink-3 space-y-2">
            <p>
              ParlayLab estimates probabilities from market prices and public stats. It is not affiliated with FanDuel and
              cannot guarantee results. Most bets lose money over time, and parlays multiply the house edge unless every leg
              has a real edge.
            </p>
            <p>Must be 21+ and in a legal betting state. Gambling problem? Call or text 1-800-GAMBLER.</p>
          </div>
        </footer>
        <Suspense fallback={null}>
          <SlipDock />
        </Suspense>
      </body>
    </html>
  );
}
