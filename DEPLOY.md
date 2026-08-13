# Docker 部署说明

键英双修打字练习系统部署指南。核心特征：SQLite 单文件数据库、Next.js standalone 运行、免密登录（家庭场景）、外部 TTS 服务可选。

## 前置要求

- Docker 20.10+ / Docker Compose 2.0+
- 端口 3000 可用（HTTPS 部署另需 80/443）
- （可选）外部 TTS 服务地址与 Token（无则不启用语音，练习功能不受影响）

## 一、快速部署（推荐）

### 1. 获取代码并配置环境变量

```bash
git clone <repository-url> typing-practice
cd typing-practice

# 生产必配：会话签名密钥（30 天有效期的登录 cookie 依赖它；不配置则每次容器重启所有会话失效）
openssl rand -hex 32
```

编辑项目根目录 `.env`（docker compose 自动读取）：

```bash
# 会话签名密钥（必填，上面生成的随机串）
SESSION_SECRET=<64位hex随机串>
# TTS 语音服务（可选；不填则语音功能不可用，打字/FSRS 复习全部正常）
TTS_SERVER_URL=http://139.155.115.250
TTS_TOKEN=<TTS服务token>
```

### 2. 一键构建并启动

```bash
docker compose up -d --build
```

### 3. 初始化数据库

**推荐方式：直接放入已初始化的数据库文件**（含全部教学数据与账号：7,572 词 / 42,752 短语 / 450 句 / 75 阅读 / 95 听力 / 语法 / 固定账号）：

```bash
mkdir -p db
cp <开发机或备份的 custom.db> db/custom.db
docker compose restart
```

**空库初始化**（仅词典数据可脚本导入；句子/阅读/听力文章需从备份库恢复，无法凭空生成）：

```bash
# 等待容器起来后导入词典（47 本词书 / 7,572 词 / 例句 / 短语 / 近义词 / 相关词）
docker exec -it typing-practice bun scripts/import-vocab.ts

# 校验 schema 与数据（db:push 幂等，schema 无变化时无副作用）
docker exec -it typing-practice bun node_modules/prisma/build/index.js db push
```

> 注意：容器镜像内无 `node_modules/.bin` 目录，`bun run db:push` 会找不到命令，必须用 `bun node_modules/prisma/build/index.js db push` 全路径方式。

### 4. 访问

浏览器打开 `http://<服务器IP>:3000`，点击弟弟/姐姐头像免密登录。

## 二、HTTPS 部署（Caddy，可选）

仓库自带 Caddyfile 与 compose 服务定义（`profiles: ["https"]`，默认不启动）：

1. 将 `Caddyfile` 中 `example.com` 替换为你的域名，并确保域名已解析到本机、80/443 端口开放
2. 启用 caddy 服务：

```bash
docker compose --profile https up -d
```

Caddy 自动申请并续期 Let's Encrypt 证书，HTTPS 流量反代到 `typing-practice:3000`。内网无域名场景可改用 Caddyfile 注释中的 `http://` 块直连。

## 三、Docker Compose 配置说明

`docker-compose.yml` 已配置：

- **端口映射**：`3000:3000`（应用）
- **数据卷**：`./db → /app/db`（SQLite 持久化）、`./upload → /app/upload`（Excel 数据源）
- **环境变量**：
  - `DATABASE_URL=file:/app/db/custom.db`（容器内固定路径，勿改）
  - `SESSION_SECRET`：会话签名密钥，生产必设（`openssl rand -hex 32` 生成）
  - `TTS_SERVER_URL` / `TTS_TOKEN`：外部 TTS 服务（仅服务端使用，前端不可见，设置中心为只读提示）
  - `TZ=Asia/Shanghai`：本地日期计算依赖（每日统计按天归档）
- **健康检查**：`curl -f http://localhost:3000/`，30s 间隔
- **自动重启**：`restart: unless-stopped`
- **镜像内置**：curl / tzdata / sqlite3（sqlite3 CLI 用于容器内热备份与运维查询）

## 四、数据备份与恢复

### 在线热备份（推荐，服务不停机）

SQLite 官方推荐的 `.backup` 命令保证一致性快照，运行中可直接执行（普通 `cp` 在写入窗口期拷贝可能拿到损坏文件）：

```bash
# 备份到宿主机 db/ 目录
docker exec typing-practice sqlite3 /app/db/custom.db ".backup '/app/db/custom.db.backup.$(date +%Y%m%d)'"

# 或直接 docker cp 出容器
docker cp typing-practice:/app/db/custom.db.backup.$(date +%Y%m%d) ./db/
```

建议配合 cron 每日备份：

```bash
# crontab -e 添加（每天 03:00 备份）
0 3 * * * cd /path/to/typing-practice && docker exec typing-practice sqlite3 /app/db/custom.db ".backup '/app/db/custom.db.backup.$(date +\%Y\%m\%d)'"
```

### 恢复

```bash
docker compose down
cp db/custom.db.backup.20260801 db/custom.db   # 用备份覆盖
docker compose up -d
```

## 五、升级部署

```bash
# 1. 升级前先热备份（见上节）
docker exec typing-practice sqlite3 /app/db/custom.db ".backup '/app/db/custom.db.pre-upgrade'"

# 2. 拉取新代码并重建
git pull
docker compose up -d --build

# 3. 如新版有 schema 变更，推送数据库（幂等）
docker exec -it typing-practice bun node_modules/prisma/build/index.js db push
```

### 回滚

```bash
docker compose down
docker cp db/custom.db.pre-upgrade db/custom.db   # 回退数据库
git checkout <上一个稳定提交>
docker compose up -d --build
```

## 六、TTS 语音服务配置

系统依赖外部 TTS 服务（`TTS_SERVER_URL` + `TTS_TOKEN`）。TTS 服务器地址与鉴权 Token 仅由环境变量配置（前端不可见，设置中心为只读提示）；音色/语速/停顿等参数可在设置中心调整：

1. 部署时在 `.env` 配置 `TTS_SERVER_URL` 和 `TTS_TOKEN`
2. 登录系统 → 设置中心 → 语音配置(TTS)
3. 配置英语音色、语速、音量、停顿等参数并保存

如果 TTS 服务不可用，打字练习与 FSRS 复习功能不受影响，仅语音播放不可用。新增/修改听力文章后建议预热 TTS 缓存（幂等）：

```bash
docker exec -it typing-practice bun scripts/prewarm-listening-tts.ts
```

## 七、常见问题

### Q: 容器启动后页面打不开？

```bash
docker compose ps                    # 容器是否 healthy
docker compose logs -f typing-practice
docker exec -it typing-practice curl -s http://localhost:3000
```

### Q: 数据库文件不存在 / 应用报"数据库不存在"？

Prisma SQLite 不会自动创建数据库文件。确保 `db/custom.db` 已放入（见「初始化数据库」），或先在容器内执行词典导入脚本建库。

### Q: `bun run db:push` 报 command not found？

镜像内没有 `node_modules/.bin`，用全路径：

```bash
docker exec -it typing-practice bun node_modules/prisma/build/index.js db push
```

### Q: 如何清除用户数据（保留教学数据）？

登录系统 → 设置中心 → 数据管理 → 清除个人数据（已设家长 PIN 时需先验证 PIN）。

### Q: 如何修改固定账号（姓名/学段）？

容器内用 sqlite3 直改 `User` 表：

```bash
# 查看账号
docker exec -it typing-practice sqlite3 /app/db/custom.db "SELECT id,name,stage,grade FROM User;"

# 修改（替换 id 与值）
docker exec -it typing-practice sqlite3 /app/db/custom.db "UPDATE User SET name='新名字', stage='初中' WHERE id='<userId>';"
```

### Q: 家长管控 PIN 忘记 / 孩子抢先设置了 PIN？

首次登录后**家长应立即在设置中心设置 PIN**（系统不会强制首次设置）。已设置后忘记 PIN：容器内清空后重设：

```bash
docker exec -it typing-practice sqlite3 /app/db/custom.db "DELETE FROM UserSetting WHERE key='parentPin' AND userId='<userId>';"
```

## 八、系统要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| CPU | 1 核 | 2 核 |
| 内存 | 512MB | 1GB |
| 磁盘 | 500MB + 数据库 | 1GB + 数据库 |
| 系统 | Linux/Mac/Windows | Linux |
