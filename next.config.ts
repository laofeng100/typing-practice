import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // E2E 测试服务使用独立构建目录：.next/dev/lock 是项目级互斥锁，
  // 与正式 dev（3000）共用 .next 会导致 3100 测试服务无法启动
  distDir: process.env.E2E === "1" ? ".next-e2e" : ".next",
  // 类型错误必须在构建期暴露（交付级质量红线：构建前跑 tsc --noEmit 零错误）
  reactStrictMode: false,
};

export default nextConfig;
