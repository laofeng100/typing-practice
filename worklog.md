# 键英双修打字练习系统 - 里程碑日志

> 项目介绍/功能/结构见 [README.md](README.md)；部署运维见 [DEPLOY.md](DEPLOY.md)；问题修复明细见 [ISSUE_TRACKER.md](ISSUE_TRACKER.md)。
> 本文档只记录各阶段里程碑与遗留待办。

## 当前状态：阶段十七完成 ✅（2026-08-01）

### 阶段十七（2026-07-25 ~ 08-01）：词典升级收尾 + FSRS 修复 + 性能优化 + 全链路测试体系

**v2 词典数据升级（续）**：
- 有道开源词典数据替换旧 6,890 词库：47 本小初高词书 / 7,572 词 / 42,752 短语 / 16,339 例句 / 22,313 近义词 / 15,957 相关词，含音标/记忆法
- 教材选择学习（Book + BookWord 词序），FSRS 新词按教材词序供给；学习区展示升级 3→5 条；交互优化（学习区前置 + 手动前进 + 错词 5 秒自动跳转）
- 音频有道 dictvoice 优先 + 系统 TTS 自动回退；**古诗词模块全链路删除**（v2 阶段5，API/组件/数据全清，勿恢复）

**FSRS 调度全面修复**（`d4015a2`）：
- learning_steps 置空修复首学卡死（首学 Hard 直进 Review）；relearning_steps 恢复 10m 重学窗口（Again 后当天可复学，勿改回空数组）
- 库存 R（retrievability 实时计算，不再恒 1.0）；错题本门槛改为 lapses≥1 或 totalErrors≥2；积压计数修复；评级阈值矩阵落地

**性能优化**（`e74973f`）：统计聚合与取词链路——热力图 90 天、报告 SQL 聚合、按需取详情、连击不截断

**全自动全链路测试体系**（`b9bf193`，核心）：
- `npm run test:all` 一键完成：初始化 e2e.db → 起 3100 测试服务 → Playwright E2E 10 流程 → vitest FSRS 单元 → 90 天模拟 → 摘要
- 三层隔离：独立测试库（正式库只读复制基础表 + 业务表清空 + e2e 固定账号）、独立服务（3100 + E2E=1 用 .next-e2e）、正式库 custom.db 零接触
- 90 天模拟 6 项硬指标全 PASS（无卡死/遗忘惩罚/队列正确性/积压防护/复习负担/错题本收录）
- 正式库清理 + setup-e2e 防呆加固（路径校验 + 清空硬校验，`dbbf12a`）

**验证**：tsc 零错误；E2E 10/10 PASS；vitest PASS；90 天模拟 allPass=true；正式库业务表 0 残留、基础表完好。

---

### 阶段十六（2026-07-24）：听力日常对话 TTS 超时修复 + 项目整理

**问题**：听力「日常对话」TTS 合成超时，其他类别正常。

**根因**（实测定位，非猜测）：
1. 其他类别整篇文章一次合成、默认音色、且音频已入 TTS 服务器永久缓存（cache hit 毫秒级）；
2. 日常对话被拆成多段（最多 11 段）逐段合成 + 轮换 4 种对话音色，分段×音色全是新缓存键 → 首次播放全部 cache miss；
3. 实测 TTS 服务器英文 cache-miss 单段合成 18~35s+，`English_Graceful_Lady` >35s 超过 App 30s 超时 → 504；`English_Playful_Child` 在服务器端持续 500（坏音色）。

**修复**：
- `api/tts/synthesize`：article 场景超时 30s→90s
- `lib/dialogue.ts`：移除坏音色 `English_Playful_Child`，child/kid/boy/girl 改映射 `English_Graceful_Lady`
- `listening-module.tsx`：对话分段改全并行合成 + 按序播放（原串行 11 段累计 3-6 分钟）
- 新增 `scripts/prewarm-listening-tts.ts` 预热脚本并执行：95 篇文章 225 个合成任务全部入永久缓存（含对话分段），幂等可重跑

**项目整理**：
- 删除 `docs/superpowers/` 6 份历史过程稿（计划/设计/审查）
- 删除 22 个一次性数据生成/标注脚本（gen-*.ts、import-data.ts、label-dialogues.ts）
- `upload/API.md` → `docs/tts-server-api.md`（TTS 服务接入参考）
- 删除 `STATE_SNAPSHOT.md`，内容并入本文件与 README

**验证**：tsc 零错误；预热二轮 225/225 cache hit。

---

### 阶段十五（2026-07-23 ~ 07-24）：全局 UI/UX 改造

完成 11 任务：
1. 设计系统 tokens（globals.css 扩展 OKLCH 语义色板/动效库/暗色全量覆盖）
2. 基础组件（Button/Card/Progress/Badge + RingProgress/EmptyState/CountUp）
3. AppShell（侧栏指示条、Tooltip、移动端底部 5 标签栏）
4. 仪表盘（今日任务卡、学习路径步骤条、7 天柱状图）
5. 打字统一体验（PracticeHUD、TypingDisplay、虚拟键盘预高亮）
6. 单词/句子（新词卡、记忆强度圆点、完成描边闪）
7. 键盘/专项（StarReveal 三星弹簧 + Confetti 20 粒子）
8. 阅读/听力/中文（点击弹卡、波形、竖排切换）
9. 统计视图（热力图、错题本、成就墙金环、解锁 toast）
10. 暗色模式（next-themes 三态切换）
11. 终审与回归（修复 2 项 Major：shake 改为 `shakeLatestError`；输入框隐藏化）

**验证**：tsc 零错误；build 成功；batch1 16/16、batch2 28/28、batch3 21/21、batch4 13/13 全绿。零新增 npm 依赖；API 契约未改。

---

### 阶段十四（2026-07-22）：文档 + Docker 部署

- 新增 README.md / DEPLOY.md / Dockerfile / docker-compose.yml / build.sh / .dockerignore / .env.example
- 多阶段构建（deps→builder→runner），standalone 模式，SQLite + upload 卷持久化，健康检查 30s

---

## 遗留待办

1. **部署待办**：生产环境配置 `SESSION_SECRET`（`openssl rand -hex 32`）；轮换已在源码历史中暴露的 TTS token；部署执行 `prisma db push`（DailyStat.listeningDone 列）
2. **TTS 服务器侧**（非本项目代码）：修复 `English_Playful_Child` 音色 500；排查英文 cache-miss 合成慢（18-35s+，高负载 >120s）
3. **L-21 延后 4 项**：热力图 per-key 精度启发式、中文 WPM 语义、FsrsReview 审计快照（需 schema 变更）、每日限额竞态（见 ISSUE_TRACKER）
4. **新增听力文章后**：执行 `bun run scripts/prewarm-listening-tts.ts` 预热 TTS 缓存

## 定时任务

- 15分钟 webDevReview（job_id: 259718）持续运行
