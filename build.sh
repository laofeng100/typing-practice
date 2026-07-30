#!/bin/bash
# ============ 镜像构建脚本 ============
# 用法:
#   ./build.sh          # 构建镜像
#   ./build.sh run      # 构建并运行
#   ./build.sh push     # 构建并推送到镜像仓库

set -e

IMAGE_NAME="typing-practice"
IMAGE_TAG="latest"
REGISTRY=""  # 如需推送，填写你的镜像仓库地址，如 registry.cn-hangzhou.aliyuncs.com/your-namespace

echo "🏗️  构建 ${IMAGE_NAME}:${IMAGE_TAG} 镜像..."

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

# 检查docker-compose是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ docker-compose未安装，请先安装Docker Compose"
    exit 1
fi

# 构建镜像
echo "📦 构建镜像..."
docker-compose build

echo "✅ 镜像构建完成: ${IMAGE_NAME}:${IMAGE_TAG}"

# 如果参数是run，则启动容器
if [ "$1" = "run" ]; then
    echo "🚀 启动容器..."
    docker-compose up -d
    echo ""
    echo "✅ 容器已启动"
    echo "   访问地址: http://localhost:3000"
    echo "   查看日志: docker-compose logs -f"
    echo ""
    echo "📋 首次部署需要初始化数据库:"
    echo "   docker exec -it typing-practice bun run scripts/seed.ts"
    echo "   docker exec -it typing-practice bun run scripts/seed-chinese.ts"
    echo "   docker exec -it typing-practice bun run scripts/seed-chinese-full.ts"

# 如果参数是push，则推送镜像
elif [ "$1" = "push" ]; then
    if [ -z "$REGISTRY" ]; then
        echo "❌ 请先设置 REGISTRY 变量（编辑本脚本填写你的镜像仓库地址）"
        exit 1
    fi
    FULL_NAME="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
    echo "📤 推送镜像到 ${FULL_NAME}..."
    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${FULL_NAME}
    docker push ${FULL_NAME}
    echo "✅ 镜像已推送: ${FULL_NAME}"
fi

echo ""
echo "📝 常用命令:"
echo "   启动:  docker-compose up -d"
echo "   停止:  docker-compose down"
echo "   日志:  docker-compose logs -f"
echo "   重建:  docker-compose up -d --build"
