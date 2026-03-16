import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pub-3ed61e23b7ec4ace84d9094f70df57b8.r2.dev",
        pathname: "/**",
      },
    ],
  },
  // Allow Remotion/Worker to fetch audio when app is reached via ngrok (cross-origin in dev)
  allowedDevOrigins: [
    "localhost:3000",
    "localhost:3001",
    "salena-towering-magnetically.ngrok-free.dev",
  ],
};

export default nextConfig;
