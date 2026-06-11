import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const destination =
      process.env.VALKEY_OPERATOR_API_BASE ?? "http://127.0.0.1:8082";

    return [
      {
        source: "/operator-api/:path*",
        destination: `${destination}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
