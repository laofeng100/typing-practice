# Docker 部署说明

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 服务器端口 3000 可用

## 一、快速部署（推荐）

### 1. 构建镜像并启动

```bash
# 克隆项目（或复制代码到服务器）
git clone <repository-url> typing-practice
cd typing-practice

# 一键构建+启动
docker-compose up -d --build
```

### 2. 初始化数据库

**推荐方式：直接使用已初始化的数据库文件**（含全部教学数据与账号：7,572 词 / 450 句 / 75 阅读 / 95 听力 / 语法 / 短语）：

```bash
# 将开发机/备份的 custom.db 放入数据卷目录（docker-compose 挂载 ./db → /app/db）
mkdir -p db && cp <备份> db/custom.db
```

**空库初始化**（仅词典数据可脚本导入，句子/阅读/听力数据需从备份库恢复）：

```bash
# 进入容器导入词典数据（47 书 / 7,572 词 / 例句 / 短语 / 近义词 / 相关词）
docker exec -it typing-practice bun scripts/import-vocab.ts

# 预热听力文章 TTS 缓存（可选但推荐，避免首次播放合成等待）
docker exec -it typing-practice bun run scripts/prewarm-listening-tts.ts
```

### 3. 访问应用

浏览器打开 `http://<服务器IP>:3000`，点击弟弟或姐姐头像即可免密登录。

## 二、Docker Compose 配置

`docker-compose.yml` 已配置好：
- **端口映射**：3000:3000
- **数据卷**：`./db` 挂载到容器 `/app/db`（SQLite数据库持久化）
- **上传目录**：`./upload` 挂载到容器 `/app/upload`（Excel数据源）
- **环境变量**：`DATABASE_URL=file:/app/db/custom.db`
  - `SESSION_SECRET`：会话签名密钥，生产必须设置（`openssl rand -hex 32`）
  - `TTS_SERVER_URL` / `TTS_TOKEN`：TTS 语音服务地址与鉴权 token（仅服务端使用，前端不可见）
- **自动重启**：`restart: unless-stopped`

## 三、单独构建镜像

```bash
# 构建镜像
docker build -t typing-practice:latest .

# 运行容器
docker run -d \
  --name typing-practice \
  -p 3000:3000 \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/upload:/app/upload \
  -e DATABASE_URL=file:/app/db/custom.db \
  --restart unless-stopped \
  typing-practice:latest
```

## 四、数据备份与恢复

### 备份

```bash
# 备份SQLite数据库
cp db/custom.db db/custom.db.backup.$(date +%Y%m%d)

# 或用docker cp
docker cp typing-practice:/app/db/custom.db ./backup/custom.db.$(date +%Y%m%d)
```

### 恢复

```bash
# 停止容器
docker-compose down

# 恢复数据库
cp backup/custom.db.20260714 db/custom.db

# 重新启动
docker-compose up -d
```

## 五、更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build

# 如有Schema变更，推送数据库
docker exec -it typing-practice bun run db:push
```

## 六、TTS语音服务配置

系统依赖外部TTS服务（地址形如 `<TTS_SERVER_URL>`）。TTS 服务器地址与鉴权 Token 由环境变量 `TTS_SERVER_URL` / `TTS_TOKEN` 统一配置（仅服务端使用，前端不可见，设置中心为只读提示）。音色/语速/停顿等参数仍可在设置中心调整：

1. 部署时在环境变量中配置 `TTS_SERVER_URL` 和 `TTS_TOKEN`
2. 登录系统 → 设置中心 → 语音配置(TTS)
3. 配置英语/中文音色、语速、停顿等参数
4. 保存设置

如果TTS服务不可用，打字练习功能不受影响，仅语音播放功能不可用。

## 七、常见问题

### Q: 容器启动后页面打不开？
```bash
# 检查容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 检查端口
docker exec -it typing-practice curl -s http://localhost:3000
```

### Q: 数据库初始化失败？
```bash
# 确认 dict/output/vocab.db 词典源库存在
ls -la dict/output/vocab.db

# 手动执行词典导入
docker exec -it typing-practice bun scripts/import-vocab.ts
```

### Q: 如何清除用户数据（保留教学数据）？
登录系统 → 设置中心 → 数据管理 → 清除个人数据

### Q: 如何修改固定账号？
直接 SQL 更新数据库 `User` 表（容器内）：

```bash
docker exec -it typing-practice sqlite3 /app/db/custom.db "UPDATE User SET name='新名字' WHERE id='cmrc3o8si0000utayfz8umxtt';"
```

## 八、系统要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| CPU | 1核 | 2核 |
| 内存 | 512MB | 1GB |
| 磁盘 | 500MB | 1GB |
| 系统 | Linux/Mac/Windows | Linux |
