import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AIProvider } from "@/components/ai/AIProvider";
import { AIButton } from "@/components/ai/AIButton";
import { AIChatPanel } from "@/components/ai/AIChatPanel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDAC BioPortal | A Multi-Cohort Transcriptomics & RT Translational Knowledgebase",
  description: "Interactive multi-cohort transcriptomic and spatial knowledgebase for bulk RNA-seq, single-nucleus RNA-seq, and 10x Visium spatial transcriptomics in pancreatic ductal adenocarcinoma and radiotherapy response",
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
        <AIProvider>
          {children}
          <AIButton />
          <AIChatPanel />
        </AIProvider>
      </body>
    </html>
  );
}

