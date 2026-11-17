import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/sitemap.xml",
    host: "https://limboper89.github.io",
  };
}
