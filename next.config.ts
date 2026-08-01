import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // E2E 测试服务使用独立构建目录：.next/dev/lock 是项目级互斥锁，
  // 与正式 dev（3000）共用 .next 会导致 3100 测试服务无法启动
  distDir: process.env.E2E === "1" ? ".next-e2e" : ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
