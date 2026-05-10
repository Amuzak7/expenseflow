import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // 複数のpackage-lock.jsonが存在する場合の警告を抑制
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // 領収書画像・PDF のアップロードに対応（デフォルト 1MB → 10MB）
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
