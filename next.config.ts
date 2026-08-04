import type { NextConfig } from "next";

const configuredBasePath = process.env.APP_BASE_PATH ?? "/dogs/akita";
const normalizedBasePath = configuredBasePath.replace(/^\/+|\/+$/g, "");
const basePath = normalizedBasePath ? `/${normalizedBasePath}` : "";

const nextConfig: NextConfig = {
  basePath,
  // Explicitly inline the normalized, non-secret public mount point for
  // client-side API and EventSource URLs.
  env: {
    APP_BASE_PATH: basePath,
  },
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
