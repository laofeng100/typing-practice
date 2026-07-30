# 键英双修 - 打字练习与英语背诵系统

> 基于 FSRS V6 记忆算法的打字练习系统，专为小升初学生设计。
> 从键盘熟悉 → 单词 → 句子 → 阅读 → 听力 → 中文背诵，渐进式解锁，边打字边学习。

## ✨ 核心功能

### 13个功能模块

| 模块 | 说明 |
|------|------|
| 学习概览 | 今日数据/学习路径/7天趋势/键盘进度 |
| 我的成就 | 24个成就徽章/词汇成长曲线/7类分类 |
| 学习报告 | 周/月/全部报告/进步对比/个性化建议 |
| 键盘熟悉 | 6关渐进训练/虚拟键盘/指法高亮/星级评价 |
| 专项练习 | 薄弱键突破/错题单词/错题句子 |
| 单词练习 | 新词学习/旧词复习/混合模式 + FSRS调度 + TTS语音 |
| 句子练习 | 语法讲解 + TTS语音朗读 |
| 阅读理解 | 纯阅读模式 + 选择题（中高考改革题型） |
| 听力练习 | TTS语音播放 + 听力理解题 |
| 中文背诵 | 古诗文打字背诵 + TTS语音朗读 |
| 键位热力图 | 准确率分布/薄弱键/指法分布 |
| 错题本 | 自动收集高错误率/遗忘卡片 |
| 设置中心 | 时长/FSRS/TTS音色/考前突击模式 |

### 教学资源库

| 资源类型 | 数量 | 说明 |
|---------|------|------|
| 英语单词 | 6,890 | 小学1,062 + 初中2,317 + 高中3,511 |
| 训练句子 | 450 | 3学段 × 150句，含语法讲解 |
| 阅读短文 | 75 | 3学段 × 25篇，6类别题型 |
| 听力文章 | 95 | 3学段，6类别，配选择题 |
| 中文必背课文 | 115 | 古诗词/文言文/现代诗文 |
| 语法句式 | 121 | 小学/初中/高中全覆盖 |
| 语法体系 | 94 | 词法/时态/语态/从句等 |

### 核心技术

- **FSRS V6 算法**：使用官方 `ts-fsrs` 包，幂律衰减模型，21权重参数，精准遗忘曲线调度
- **学段自动晋级**：小学→初中→高中，学完当前学段自动解锁下一学段
- **考前突击模式**：动态调整新词量/复习量/时长上限
- **TTS语音集成**：英语/中文分离配置，支持音色/语速/音调/停顿调节
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

## 📁 项目结构

```
├── prisma/
│   └── schema.prisma              # 数据库Schema（15张表）
├── scripts/
│   ├── seed.ts                    # 初始化账号+导入Excel数据
│   ├── seed-chinese.ts            # 中文课文（35篇基础）
│   ├── seed-chinese-full.ts       # 中文课文补充（80篇）
│   ├── prewarm-listening-tts.ts   # 听力文章TTS缓存预热（幂等）
│   ├── test-batch1~4.ts           # 回归测试（功能/数据/安全/健壮性）
│   └── test-seed-batch1~4.ts      # 回归测试数据准备
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
│   │   │   ├── chinese/           # 中文背诵
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
│   │   │   ├── chinese-module.tsx     # 中文背诵
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
├── Dockerfile                     # Docker镜像构建
├── docker-compose.yml             # Docker Compose编排
├── .env                           # 环境变量
└── package.json
```

## 👤 固定账号

| 姓名 | 手机号 | 说明 |
|------|--------|------|
| 弟弟 | 18990341688 | 免密登录 |
| 姐姐 | 18011289973 | 免密登录 |

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
