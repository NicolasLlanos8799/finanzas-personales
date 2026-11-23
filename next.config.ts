import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Atajo de iOS firmado: público a propósito (no contiene ningún secreto)
        source: "/atajos/:archivo*",
        headers: [
          { key: "Content-Type", value: "application/vnd.apple.shortcut" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
