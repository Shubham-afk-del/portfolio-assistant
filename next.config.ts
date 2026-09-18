import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // content/profile.yaml is read from disk, so the parser must stay on the server.
  // Server Components already guarantee that; this makes the boundary explicit and
  // fails loudly if a Client Component ever imports lib/profile.ts.
  serverExternalPackages: ["yaml"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
