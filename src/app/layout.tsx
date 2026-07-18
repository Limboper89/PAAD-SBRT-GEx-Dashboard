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
  title: "PDAC Radiotherapy & TME Gene Expression Dashboard",
  description: "Interactive analytics dashboard for bulk RNA-seq, single-nucleus RNA-seq, and spatial transcriptomics in pancreatic cancer treatment response",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans min-h-full bg-slate-950 text-slate-100 flex flex-col antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
