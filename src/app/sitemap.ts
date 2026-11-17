import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/",
      lastModified: new Date("2026-11-16"),
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];
}
