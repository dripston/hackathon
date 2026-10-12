import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Modern SaaS: Inter Tight for headlines, Inter for body and UI, JetBrains Mono for data, traces and commits.
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"] });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Antibody: on-call for AI agents",
  description:
    "Antibody catches AI agent failures that don't crash, finds the commit that caused them, proves a fix on a family of variants, and calls you to approve it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
