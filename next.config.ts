import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/admin/vuelo", destination: "/admin/vuelos", permanent: false }];
  },
};

export default nextConfig;
