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
  metadataBase: new URL("https://limboper89.github.io"),
  title: {
    default:
      "PDAC BioPortal | Pancreatic Cancer Multi-Cohort Transcriptomics, SBRT, Single-Nucleus & Spatial Knowledgebase",
    template: "%s | PDAC BioPortal",
  },
  applicationName: "PDAC BioPortal",
  description:
    "PDAC BioPortal (featuring PDACopilot AI) is an open-access multi-scale pancreatic ductal adenocarcinoma (PDAC) transcriptomics and proteomics knowledgebase integrating TCGA-PAAD vs GTEx normal pancreas (n=349), CPTAC-PDAC global TMT proteomics and paired RNA-seq (Cao et al., Cell 2021; n=140 tumors, 75 NATs, 11,662 proteins), neoadjuvant SBRT bulk RNA-seq (GSE225767, n=55), single-nucleus RNA-seq atlas (GSE202051, 224,988 nuclei), and 10x Visium spatial transcriptomics (GSE274103).",
  keywords: [
    "PDAC BioPortal",
    "PDACopilot",
    "Pancreatic Ductal Adenocarcinoma",
    "PDAC transcriptomics",
    "PAAD-SBRT-GEx-Dashboard",
    "GSE225767",
    "GSE202051",
    "GSE274103",
    "TCGA-PAAD",
    "GTEx pancreas",
    "SBRT pancreatic cancer",
    "stereotactic body radiotherapy PDAC",
    "single-nucleus RNA-seq PDAC",
    "spatial transcriptomics PDAC",
    "10x Visium PDAC",
    "NFE2L2",
    "NRF2",
    "PHGDH",
    "pancreatic cancer gene expression portal",
    "pancreatic cancer bioportal",
  ],
  authors: [
    {
      name: "Prince Kumar",
      url: "https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard",
    },
  ],
  creator: "Prince Kumar",
  publisher: "PDAC BioPortal",
  alternates: {
    canonical: "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/",
    siteName: "PDAC BioPortal",
    title:
      "PDAC BioPortal & PDACopilot | Pancreatic Cancer Multi-Scale Transcriptomics Knowledgebase",
    description:
      "Interactive multi-cohort transcriptomics and translational knowledgebase for Pancreatic Ductal Adenocarcinoma (PDAC): TCGA-PAAD vs GTEx, Neoadjuvant SBRT (GSE225767), Single-Nucleus Atlas (GSE202051), and 10x Visium Spatial Transcriptomics (GSE274103).",
    images: [
      {
        url: "/PAAD-SBRT-GEx-Dashboard/pdac_bioportal_logo.png",
        width: 1200,
        height: 630,
        alt: "PDAC BioPortal - A Multicohort Transcriptomics & Translational Knowledgebase",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "PDAC BioPortal & PDACopilot | Pancreatic Cancer Transcriptomics Knowledgebase",
    description:
      "Open-access multi-scale PDAC transcriptomics portal integrating TCGA-PAAD vs GTEx, SBRT Bulk RNA-seq (GSE225767), Single-Nucleus RNA-seq (GSE202051), and Visium Spatial Transcriptomics (GSE274103).",
    images: ["/PAAD-SBRT-GEx-Dashboard/pdac_bioportal_logo.png"],
  },
  other: {
    citation_title:
      "PDAC BioPortal: An Integrated Multi-Scale Framework for Context-Aware Analysis of Pancreatic Cancer Transcriptomics",
    citation_author: "Kumar, Prince",
    citation_author_institution: "University of California, Los Angeles",
    citation_publication_date: "2026",
    citation_doi: "10.5281/zenodo.22149338",
    citation_public_url:
      "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/",
    "dc.identifier": "doi:10.5281/zenodo.22149338",
    "dc.title":
      "PDAC BioPortal: An Integrated Multi-Scale Framework for Context-Aware Analysis of Pancreatic Cancer Transcriptomics",
  },
};

const portalUrl = "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "PDAC BioPortal",
      alternateName: [
        "PDACopilot",
        "PDAC BioPortal & PDACopilot",
        "PAAD-SBRT-GEx-Dashboard",
      ],
      url: portalUrl,
    },
    {
      "@type": "WebApplication",
      name: "PDAC BioPortal",
      applicationCategory: "BioinformaticsApplication",
      operatingSystem: "Web browser",
      url: portalUrl,
      identifier: "https://doi.org/10.5281/zenodo.22149338",
      sameAs: [
        "https://doi.org/10.5281/zenodo.22149338",
        "https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard",
      ],
      description:
        "Interactive multi-cohort transcriptomics analytics portal and PDACopilot AI assistant for pancreatic ductal adenocarcinoma (PDAC), integrating bulk RNA-seq, neoadjuvant SBRT cohorts, single-nucleus RNA-seq, and 10x Visium spatial transcriptomics.",
      isAccessibleForFree: true,
    },
    {
      "@type": "Dataset",
      name: "PDAC BioPortal: Integrated Multi-Cohort Pancreatic Ductal Adenocarcinoma (PDAC) Transcriptomics Knowledgebase",
      description:
        "Open-access multi-scale transcriptomic resource for pancreatic ductal adenocarcinoma (PDAC) integrating harmonized TCGA-PAAD vs GTEx normal pancreas bulk RNA-seq (n=349), neoadjuvant stereotactic body radiotherapy (SBRT) bulk RNA-seq (GSE225767, n=55), single-nucleus chemoradiotherapy transcriptomics (GSE202051, 224,988 nuclei across 43 patients), and 10x Genomics Visium spatial transcriptomics (GSE274103, 23,436 spots across 5 sections).",
      url: portalUrl,
      identifier: [
        "https://doi.org/10.5281/zenodo.22149338",
        "doi:10.5281/zenodo.22149338",
        "GSE225767",
        "GSE202051",
        "GSE274103",
        "TCGA-PAAD",
      ],
      license: "https://creativecommons.org/licenses/by/4.0/",
      isAccessibleForFree: true,
      creator: {
        "@type": "Person",
        name: "Prince Kumar",
        affiliation: {
          "@type": "Organization",
          name: "University of California, Los Angeles (UCLA)",
        },
      },
      keywords: [
        "PDAC BioPortal",
        "PDACopilot",
        "Pancreatic Ductal Adenocarcinoma",
        "Transcriptomics",
        "SBRT",
        "GSE225767",
        "GSE202051",
        "GSE274103",
        "TCGA-PAAD",
        "GTEx",
        "Single-Nucleus RNA-seq",
        "Spatial Transcriptomics",
        "10x Visium",
        "NFE2L2",
        "NRF2",
      ],
      hasPart: [
        {
          "@type": "Dataset",
          name: "TCGA-PAAD vs GTEx Normal Pancreas Harmonized Bulk Transcriptomics",
          description:
            "UCSC Xena Toil recompute RNA-seq comparison of 178 primary TCGA-PAAD tumors, 167 GTEx normal pancreas samples, and 4 TCGA solid tissue normal controls with Wilcoxon and limma-voom differential expression.",
          identifier: "TCGA-PAAD",
        },
        {
          "@type": "Dataset",
          name: "GSE225767 Neoadjuvant SBRT Bulk RNA-seq Cohort",
          description:
            "Bulk RNA-sequencing of 55 human PDAC samples comparing 26 pre-treatment diagnostic FNA biopsies and 29 post-treatment surgical resections following induction chemotherapy and stereotactic body radiotherapy (SBRT).",
          identifier: "GSE225767",
        },
        {
          "@type": "Dataset",
          name: "GSE202051 PDAC Single-Nucleus Reference Atlas",
          description:
            "Single-nucleus RNA-seq atlas of 224,988 nuclei across 43 human PDAC specimens (treatment-naive and neoadjuvant chemoradiotherapy) with UMAP embeddings, cell-lineage resolution, and patient-level pseudobulk profiles.",
          identifier: "GSE202051",
        },
        {
          "@type": "Dataset",
          name: "GSE274103 PDAC 10x Visium Spatial Transcriptomics",
          description:
            "10x Genomics Visium spatial transcriptomics across 23,436 tissue spots and 17,943 genes from five human PDAC sections aligned with H&E brightfield histology.",
          identifier: "GSE274103",
        },
        {
          "@type": "Dataset",
          name: "CPTAC-PDAC Discovery Proteomics & Proteogenomics Cohort (Cao et al., Cell 2021)",
          description:
            "CPTAC Pancreatic Ductal Adenocarcinoma global TMT proteomics (11,662 proteins across 140 tumors and 75 NATs with 67 paired Tumor-NAT samples), matched bulk RNA-seq (140 tumors, 21 NATs), and 134 clinical overall survival follow-up cases.",
          identifier: "paad_cptac_2021",
        },
      ],
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <section
          className="sr-only"
          aria-label="PDAC BioPortal Scientific Overview and Dataset Index"
        >
          <h1>
            PDAC BioPortal: An Integrated Multi-Scale Framework for Context-Aware
            Analysis of Pancreatic Cancer Transcriptomics
          </h1>
          <p>
            PDAC BioPortal and PDACopilot provide an open-access multi-scale
            translational knowledgebase for pancreatic ductal adenocarcinoma
            (PDAC). The platform integrates four independent human PDAC cohorts:
            harmonized TCGA-PAAD vs GTEx normal pancreas bulk RNA-seq (n=349;
            178 tumors, 167 GTEx normal pancreas, 4 solid tissue normals),
            clinically annotated neoadjuvant stereotactic body radiotherapy
            (SBRT) bulk RNA-seq (GSE225767; 26 pre-treatment FNA biopsies and 29
            post-treatment resections), a single-nucleus RNA-seq reference atlas
            (GSE202051; 224,988 nuclei across 43 patients), and 10x Genomics
            Visium spatial transcriptomics (GSE274103; 23,436 tissue spots
            across 5 clinical sections with H&amp;E histology overlay), and
            CPTAC-PDAC global TMT proteomics and matched RNA-seq (Cao et al.,
            Cell 2021, PMID:34534465; 11,662 quantified proteins across 140
            primary tumors and 75 normal adjacent tissues, 11,651 paired
            mRNA-protein genes, and 134 overall survival follow-up cases).
          </p>
          <p>
            Interactive analytical modules include Differential Expression
            Volcano Plots and DEG Tables, Single-Gene and Multi-Gene Signature
            Co-Expression Correlation and Heatmaps, MSigDB Hallmark, Reactome,
            and KEGG Over-Representation Analysis (ORA) and Pre-Ranked GSEA
            Pathway Explorer, Kaplan-Meier Survival and Pathologic Response
            Explorer, Single-Nucleus UMAP and Patient-Level Pseudobulk
            Deconvolution, and Spatial Transcriptomics Visualization for key
            pancreatic cancer genes and pathways including NFE2L2 (NRF2), NQO1,
            HMOX1, SLC7A11, PHGDH, PSAT1, KRAS, TP53, SMAD4, and CDKN2A.
          </p>
          <nav aria-label="PDAC BioPortal External Archives">
            <a href="https://doi.org/10.5281/zenodo.22149338">
              Zenodo Permanent Archive (DOI: 10.5281/zenodo.22149338)
            </a>
            <a href="https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard">
              GitHub Repository (Limboper89/PAAD-SBRT-GEx-Dashboard)
            </a>
          </nav>
        </section>
        <AIProvider>
          {children}
          <AIButton />
          <AIChatPanel />
        </AIProvider>
      </body>
    </html>
  );
}

