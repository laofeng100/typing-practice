FROM oven/bun:1.3 AS base

# ============ 依赖安装阶段 ============
FROM base AS deps
WORKDIR /app

# 复制package.json和lockfile
COPY package.json bun.lock* ./

# 安装依赖
RUN bun install --frozen-lockfile

# ============ 构建阶段 ============
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 生成Prisma Client
RUN bun run db:generate

# 构建Next.js（standalone模式）
RUN bun run build

# ============ 运行阶段 ============
FROM base AS runner
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/db/custom.db
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 时区：datetime.ts 的本地日期计算依赖此项（docker-compose 未覆盖时的兜底默认）
ENV TZ=Asia/Shanghai

# 安装最小运行时依赖（sqlite3 CLI 用于容器内热备份/运维查询，见 DEPLOY.md）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# 创建数据目录
RUN mkdir -p /app/db /app/upload

# 复制standalone构建产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制Prisma相关文件（用于db:push等命令）
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# 复制脚本和配置
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock* ./
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# 复制Excel数据源（用于初始化）
COPY --from=builder /app/upload ./upload

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# 启动命令（standalone 产物已复制到 /app 根目录）
CMD ["bun", "server.js"]
