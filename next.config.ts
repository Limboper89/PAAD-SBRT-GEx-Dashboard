import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" } : {}),
  basePath: "/PAAD-SBRT-GEx-Dashboard",
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/PAAD-SBRT-GEx-Dashboard",
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
