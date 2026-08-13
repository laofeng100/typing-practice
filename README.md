# 键英双修 - 打字练习与英语背诵系统

> 基于 FSRS V6 记忆算法的打字练习系统，专为小升初学生设计。
> 从键盘熟悉 → 单词 → 句子 → 阅读 → 听力，渐进式解锁，边打字边学习。

## ✨ 核心功能

### 12个功能模块

| 模块 | 说明 |
|------|------|
| 学习概览 | 今日数据/学习路径/7天趋势/键盘进度 |
| 我的成就 | 22个成就徽章/词汇成长曲线/7类分类 |
| 学习报告 | 周/月/全部报告/进步对比/个性化建议 |
| 键盘熟悉 | 6关渐进训练/虚拟键盘/指法高亮/星级评价 |
| 专项练习 | 薄弱键突破/错题单词/错题句子 |
| 单词练习 | 新词学习/旧词复习/混合模式 + FSRS调度 + TTS语音 |
| 句子练习 | 语法讲解 + TTS语音朗读 |
| 阅读理解 | 纯阅读模式 + 选择题（中高考改革题型） |
| 听力练习 | TTS语音播放 + 听力理解题 |
| 键位热力图 | 准确率分布/薄弱键/指法分布 |
| 错题本 | 自动收集高错误率/遗忘卡片 |
| 设置中心 | 时长/FSRS/TTS音色/考前突击模式 |

### 教学资源库

| 资源类型 | 数量 | 说明 |
|---------|------|------|
| 英语单词 | 7,572 | 有道词典数据：小学/初中/高中，含音标/例句/记忆法 |
| 训练短语 | 42,752 | 分年级短语搭配（含中文释义） |
| 训练句子 | 450 | 3学段 × 150句，含语法讲解 |
| 阅读短文 | 75 | 3学段 × 25篇，6类别题型 |
| 听力文章 | 95 | 3学段，6类别，配选择题 |
| 语法句式 | 121 | 小学/初中/高中全覆盖 |
| 语法体系 | 94 | 词法/时态/语态/从句等 |
| 近义词/相关词 | 38,270 | 词条关联扩展（近义 22,313 + 相关 15,957） |

### 核心技术

- **FSRS V6 算法**：使用官方 `ts-fsrs` 包，幂律衰减模型，21权重参数，精准遗忘曲线调度
- **学段自动晋级**：小学→初中→高中，学完当前学段自动解锁下一学段
- **考前突击模式**：动态调整新词量/复习量/时长上限
- **TTS语音集成**：英文音色/语速/音调/停顿可调，服务端 env 配置、token 不下发前端
- **渐进解锁**：键盘6关 + WPM≥40 才能解锁高级模块

## 🛠 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Next.js | 16 | App Router + Turbopack |
| TypeScript | 5 | 全量类型安全 |
| Tailwind CSS | 4 | 原子化样式 |
| shadcn/ui | - | New York 风格组件库 |
| Prisma | 6 | ORM |
| SQLite | - | 嵌入式数据库，便于部署 |
| ts-fsrs | 5.4.1 | 官方FSRS-6算法包 |
| Framer Motion | 12 | 动画 |
| z-ai-web-dev-sdk | - | LLM内容生成 |
| Playwright（dev） | 1.62 | E2E 流程测试 |
| Vitest（dev） | 4.1 | FSRS 单元测试 |

## 📁 项目结构

```
├── prisma/
│   └── schema.prisma              # 数据库Schema（21个模型）
├── scripts/
│   ├── import-vocab.ts            # v2 词典导入（47书/7572词+内容表）
│   ├── import-phrases-full.ts     # 全量短语导入（42,752条）
│   ├── import-content.ts          # 内容表重导（按 head_word 聚合去重）
│   ├── fix-word-cards.ts          # 词卡数据修复
│   ├── prewarm-listening-tts.ts   # 听力文章TTS缓存预热（幂等）
│   ├── gen-*.ts / test-batch*.ts  # 历史数据生成与旧回归脚本（已被 test:all 取代，保留备查）
│   └── test/
│       ├── setup-e2e.ts           # 重建测试库 e2e.db（只读复制正式库基础表）
│       ├── run-all.sh             # test:all 全链路编排
│       └── fsrs-simulate.mjs      # 90天 FSRS 模拟评估（6项硬指标）
├── tests/
│   ├── e2e/                       # Playwright 流程测试（01~10 数字前缀强制顺序）
│   └── fsrs/fsrs-unit.test.ts     # vitest FSRS 单元测试
├── playwright.config.ts           # E2E 配置（3100 端口，串行）
├── vitest.config.ts               # vitest 配置
├── docs/
│   └── tts-server-api.md          # 外部TTS服务接入参考
├── src/
│   ├── app/
│   │   ├── api/                   # API路由
│   │   │   ├── auth/              # 免密登录
│   │   │   ├── users/             # 用户列表
│   │   │   ├── dashboard/         # 仪表盘数据
│   │   │   ├── session/           # 练习提交+FSRS更新
│   │   │   ├── word/              # 单词练习（学段晋级）
│   │   │   ├── sentence/          # 句子练习
│   │   │   ├── article/           # 阅读理解
│   │   │   ├── listening/         # 听力练习
│   │   │   ├── tts/               # TTS语音代理（synthesize/audio/meta）
│   │   │   ├── stats/             # 统计（热力图/报告/成就）
│   │   │   ├── mistakes/          # 错题本
│   │   │   ├── practice/focused/  # 专项练习
│   │   │   ├── progress/          # 学习进度
│   │   │   ├── data/reset/        # 清除个人数据
│   │   │   └── settings/          # 用户设置
│   │   ├── globals.css            # 全局样式（设计tokens）
│   │   ├── layout.tsx             # 根布局
│   │   └── page.tsx               # 首页（登录/主应用）
│   ├── components/
│   │   ├── app/
│   │   │   ├── login-screen.tsx   # 免密登录页
│   │   │   ├── app-shell.tsx      # 主框架（导航+视图切换）
│   │   │   ├── dashboard.tsx      # 仪表盘
│   │   │   └── settings-panel.tsx # 设置中心
│   │   ├── practice/
│   │   │   ├── keyboard-module.tsx    # 键盘练习
│   │   │   ├── word-module.tsx        # 单词练习
│   │   │   ├── sentence-module.tsx    # 句子练习
│   │   │   ├── reading-module.tsx     # 阅读理解
│   │   │   ├── listening-module.tsx   # 听力练习（多音色对话）
│   │   │   ├── focused-practice.tsx   # 专项练习
│   │   │   ├── tts-player.tsx         # TTS播放组件
│   │   │   ├── practice-hud.tsx       # 打字实时指标条
│   │   │   ├── typing-components.tsx  # 打字显示/虚拟键盘
│   │   │   ├── key-heatmap.tsx        # 键位热力图
│   │   │   ├── mistake-book.tsx       # 错题本
│   │   │   ├── achievements.tsx       # 成就徽章
│   │   │   └── study-report.tsx       # 学习报告
│   │   └── ui/                    # shadcn/ui 组件库
│   ├── hooks/                     # use-toast / use-mobile
│   └── lib/
│       ├── fsrs.ts                # FSRS V6算法（ts-fsrs封装）
│       ├── auth.ts                # 签名会话Cookie
│       ├── settings.ts            # 用户设置（含TTS配置）
│       ├── dialogue.ts            # 听力对话解析+多音色分配
│       ├── typing.ts              # 打字工具+键盘关卡配置
│       ├── achievements.ts        # 成就定义
│       ├── datetime.ts            # 本地日期工具
│       ├── utils.ts               # 通用工具
│       └── db.ts                  # Prisma Client
├── upload/                        # Excel教学数据源
├── Dockerfile                     # Docker镜像构建（内置 curl/tzdata/sqlite3）
├── docker-compose.yml             # Docker Compose编排（可选 --profile https 启用 Caddy）
├── Caddyfile                      # HTTPS 反向代理配置（域名占位，自动证书）
├── .env                           # 环境变量
└── package.json
```

## 👤 固定账号

| 姓名 | 手机号 | 说明 |
|------|--------|------|
| 弟弟 | 18990341688 | 免密登录 |
| 姐姐 | 18011289973 | 免密登录 |

## 🧪 自动化测试

`npm run test:all` 一键全链路回归（正式库零接触）：

| 阶段 | 内容 |
|------|------|
| setup | 重建测试库 `e2e.db`：只读复制正式库基础表 + 清空业务表 + e2e 固定账号 |
| E2E | Playwright 14 个流程（登录/仪表盘/键盘/单词新学/单词复习/句子/错题本/成就/限额/重置/突击模式/FSRS 细节/健壮性/规模），3100 端口独立服务，串行执行 |
| 单元 | vitest FSRS 测试（评级阈值/调度/无卡死/R 存储/突击保留率/自定义参数/maxInterval 封顶/边界值） |
| 模拟 | 90 天 FSRS 调度模拟，6 项硬指标（无卡死/遗忘惩罚/队列正确性/积压防护/复习负担/错题本） |

隔离原则：测试全程只操作 `prisma/db/e2e.db` 与 3100 端口服务（`E2E=1` 时 next 使用独立 `.next-e2e` 构建目录）；正式库 `custom.db` 仅被只读复制基础表，业务表清空只发生在测试库。

FSRS 细节盲区（11/12 流程与新增单测）：突击模式提前 7 天拉取 + batch 放大 + 0.95 保留率提交；hintCount 封顶；零击键守卫；自定义 fsrsRetention 保存生效；复习队列按实时 R 升序。

深度测试（13/14 流程）：健壮性——非法 module/超量 records/非法 rating 回退/负数归零/空 records/并发提交/幂等更新；规模——300 卡到期积压停发 + 队列截断 + 性能阈值（<5s）。

构建红线：`next build` 与 `tsc --noEmit` 双重类型检查（`ignoreBuildErrors` 已移除），改代码后类型错误零容忍；改 FSRS 相关必须重跑 `npm run test:fsrs`。

## 🐳 Docker 部署

见 [DEPLOY.md](./DEPLOY.md)：一键 compose 部署、HTTPS（Caddy 自动证书）、SQLite 在线热备份（`.backup`）、升级回滚、TTS 配置与常见问题。

## 🎨 设计特色

- **配色**：温暖琥珀橙(primary) + 森林绿(accent)，避免蓝紫
- **响应式**：移动端/桌面端自适应
- **动画**：Framer Motion 微交互（hover/press/page transition）
- **无障碍**：语义HTML + ARIA标签 + 键盘导航

## 🔒 数据安全

- 所有教学数据入库，页面零硬编码
- 个人数据与教学数据隔离
- 设置中心支持一键清除个人数据（保留教学数据）
- SQLite嵌入式数据库，便于备份部署
