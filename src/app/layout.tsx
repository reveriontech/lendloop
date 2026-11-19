import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = localFont({ src: "./fonts/inter.woff2", weight: "100 900", variable: "--font-sans" });

const space = localFont({ src: "./fonts/space-grotesk.woff2", weight: "300 700", variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "LendLoop — Neighborhood Tool Lending",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable + " " + space.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
