import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/PAAD-SBRT-GEx-Dashboard",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
