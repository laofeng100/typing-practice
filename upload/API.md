# listen-eng TTS 服务 API 文档（AI 接入版）

> 给英语学习软件 + 古诗文背诵系统统一使用的语音合成后端。
>
> 封装 Minimax 全部三种 TTS 接口（HTTP 同步、WebSocket 流式、Async 异步），
> 加一层 SQLite + 本地文件的多级缓存，业务方只调 `/api/v1/tts/*` 即可。
>
> 本文档是给 **AI / 程序** 直接接入的参考，所有示例代码已实测可运行。

- **版本**：`0.2.0`
- **基础 URL**：`http://127.0.0.1:8000`（公网部署时改）
- **数据格式**：JSON（除 WebSocket 外）
- **鉴权**：所有 `/api/v1/tts/*` 与 `/static/*` 强制 token 校验。
  唯一例外：`/`（重定向）、`/healthz`（仅 JSON `{"ok": true}`）。
- **token 传法**（任选其一）：
  1. HTTP Header：`Authorization: Bearer <token>`
  2. Query 参数：`?token=<token>`
  3. WebSocket init 消息：`{ "op": "start", "token": "..." }`
- **默认 token**：`listen-eng-2025-secret-key`
  通过环境变量 `API_TOKEN` 或 [app/core/config.py](file:///Users/yuanxin/Documents/trae_projects/listen-eng/app/core/config.py) 修改。

---

## 0. 一句话接入指引（AI 必读）

> **最小可用**：调 `POST /api/v1/tts/synthesize`，传 `text` + `voice_id` + `scene`，
> 拿 `audio_url`，拼上 `?token=<token>` 即可播放。

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/tts/synthesize" \
  -H "Authorization: Bearer listen-eng-2025-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","scene":"word","voice_id":"English_PassionateWarrior","subtitle_type":"none"}'

# 返回
# {"audio_url":"/static/tts/word/english/English_PassionateWarrior/1f/3870be27.mp3", ...}

# 浏览器播放：拼 token
# /static/tts/word/english/English_PassionateWarrior/1f/3870be27.mp3?token=listen-eng-2025-secret-key
```

---

## 1. 接口总览（10 个端点）

| # | 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|---|
| 1 | `GET` | `/healthz` | 公开 | 健康检查，固定返回 `{"ok": true}` |
| 2 | `GET` | `/` | 公开 | 重定向到 `/static/index.html` |
| 3 | `GET` | `/static/index.html` | **需 token** | 测试页面（浏览器联调） |
| 4 | `GET` | `/static/tts/<rel_path>` | **需 token** | 音频文件（MP3/PCM/WAV） |
| 5 | `GET` | `/api/v1/tts/meta` | **需 token** | 音色 / 模型 / 语言 / 场景目录 |
| 6 | `GET` | `/api/v1/tts/healthz` | **需 token** | 服务配置（路径 + minimax 配置） |
| 7 | `POST` | `/api/v1/tts/synthesize` | **需 token** | **★ 统一合成入口** |
| 8 | `WS` | `/api/v1/tts/ws` | **需 token** | 流式合成（首包低延迟） |
| 9 | `POST` | `/api/v1/tts/article` | **需 token** | 提交文章异步任务 |
| 10 | `GET` | `/api/v1/tts/article/{task_id}` | **需 token** | 查询任务（`?force=1` 强刷） |
| 11 | `GET` | `/api/v1/tts/tasks` | **需 token** | 任务列表 |
| 12 | `GET` | `/api/v1/tts/cache/stats` | **需 token** | 缓存统计 |
| 13 | `GET` | `/api/v1/tts/cache/recent` | **需 token** | 缓存条目列表 |
| 14 | `POST` | `/api/v1/tts/cache/cleanup` | **需 token** | 清理临时缓存 |

> 旧的 `/api/v1/tts/word` `/sentence` `/chinese` `/article/{id}/refresh` 已被合并/删除，请改用统一入口。

---

## 2. ★ POST /api/v1/tts/synthesize — 统一合成（最高频接口）

### 2.1 请求体

```json
{
  "text": "Hello world!",                         // 必填，1-10000 字符
  "scene": "general",                             // word/sentence/chinese/article/general
  "voice_id": "English_PassionateWarrior",        // 默认值，建议先查 /meta
  "language": "english",                          // english/chinese/cantonese/auto
  "speed": 1.0,                                   // 0.5-2.0
  "vol": 1.0,                                     // 0.0-10.0
  "pitch": 0,                                     // -12 到 12
  "subtitle_type": "sentence",                    // none/sentence/word/word_streaming
  "model": "",                                    // 空 = 用默认
  "sample_rate": 32000,                           // 8000/16000/24000/32000/44100
  "bitrate": 128000,                              // 32000/64000/128000/192000
  "fmt": "mp3",                                   // mp3/pcm/wav
  "channel": 1,                                   // 1=单声道 2=立体声
  "is_permanent": true,                           // true=永久缓存 false=临时
  "pause_dou_hao_ms": 200,                        // '，' 后停顿 0-5000 ms
  "pause_ju_hao_ms": 350,                         // '。' 后停顿 0-5000 ms
  "pause_dun_hao_ms": 250                         // '、' 后停顿 0-5000 ms
}
```

### 2.2 字段详细约束

| 字段 | 类型 | 必填 | 默认 | 取值范围 | 备注 |
|---|---|---|---|---|---|
| `text` | string | ✅ | — | 1 ≤ len ≤ 10000 | 控制字符会被自动清理 |
| `scene` | enum | ❌ | `"general"` | `word` / `sentence` / `chinese` / `article` / `general` | 影响默认模型 |
| `voice_id` | string | ❌ | `"English_PassionateWarrior"` | 字符串 ≤ 64 字符 | 不在 /meta 目录中也可（Minimax 接受自训练音色） |
| `language` | enum | ❌ | `"english"` | `english` / `chinese` / `cantonese` / `auto` | |
| `speed` | float | ❌ | `1.0` | 0.5 ≤ v ≤ 2.0 | NaN/inf 自动拒绝 |
| `vol` | float | ❌ | `1.0` | 0.0 ≤ v ≤ 10.0 | NaN/inf 自动拒绝 |
| `pitch` | int | ❌ | `0` | -12 ≤ v ≤ 12 | 半音 |
| `subtitle_type` | enum | ❌ | `"sentence"` | `none` / `sentence` / `word` / `word_streaming` | `word_streaming` 仅 WS |
| `model` | string | ❌ | `""` | 字符串 ≤ 64 | `speech-2.8-turbo` (单词/短句) / `speech-2.8-hd` (article) |
| `sample_rate` | enum | ❌ | `32000` | `8000` / `16000` / `24000` / `32000` / `44100` | 必须与 bitrate 兼容 |
| `bitrate` | enum | ❌ | `128000` | `32000` / `64000` / `128000` / `192000` | 8000 Hz 不支持 192000，44100 Hz 不支持 32000 |
| `fmt` | enum | ❌ | `"mp3"` | `mp3` / `pcm` / `wav` | 文件后缀 |
| `channel` | int | ❌ | `1` | 1 / 2 | 单声道 / 立体声 |
| `is_permanent` | bool | ❌ | `true` | — | 永久 vs 临时缓存 |
| `pause_*_ms` | int | ❌ | 见左 | 0 ≤ v ≤ 5000 | 中文古诗场景用 |

### 2.3 响应体

```json
{
  "audio_url": "/static/tts/word/english/English_PassionateWarrior/1f/3870be27.mp3",
  "rel_path": "word/english/English_PassionateWarrior/1f/3870be27.mp3",
  "cache": "miss",                         // "miss" 或 "hit"
  "duration_ms": 828,
  "file_size": 14964,
  "language": "english",
  "scene": "word",
  "extra": {
    "audio_length": 828,
    "audio_sample_rate": 32000,
    "audio_size": 14964,
    "bitrate": 128000,
    "word_count": 5,
    "usage_characters": 5,
    "audio_format": "mp3",
    "audio_channel": 1
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `audio_url` | string | 业务方可直接播放的 URL，**记得拼上 token** |
| `rel_path` | string | 相对 `storage_dir` 的路径，调试用 |
| `cache` | string | `"hit"` 命中 / `"miss"` 新合成 |
| `duration_ms` | int | 音频时长（来自 Minimax `audio_length`） |
| `file_size` | int | 字节数 |
| `extra` | object | Minimax 原始 `extra_info` |

### 2.4 接入示例

**Python（requests）**：
```python
import requests

TOKEN = "listen-eng-2025-secret-key"
BASE = "http://127.0.0.1:8000"

resp = requests.post(
    f"{BASE}/api/v1/tts/synthesize",
    headers={"Authorization": f"Bearer {TOKEN}"},
    json={
        "text": "Hello world!",
        "scene": "word",
        "voice_id": "English_PassionateWarrior",
        "subtitle_type": "none",
    },
)
resp.raise_for_status()
audio_url = resp.json()["audio_url"]

# 播放/下载
play_url = f"{BASE}{audio_url}?token={TOKEN}"
```

**JavaScript（fetch）**：
```js
const TOKEN = "listen-eng-2025-secret-key";
const BASE = "http://127.0.0.1:8000";

const resp = await fetch(`${BASE}/api/v1/tts/synthesize`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "Hello world!",
    scene: "word",
    voice_id: "English_PassionateWarrior",
    subtitle_type: "none",
  }),
});
const data = await resp.json();
const audio = new Audio(`${BASE}${data.audio_url}?token=${TOKEN}`);
audio.play();
```

**cURL**：
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/tts/synthesize" \
  -H "Authorization: Bearer listen-eng-2025-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","scene":"word","voice_id":"English_PassionateWarrior","subtitle_type":"none"}'
```

### 2.5 中文古诗示例（带停顿）

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/tts/synthesize" \
  -H "Authorization: Bearer listen-eng-2025-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "床前明月光，疑是地上霜。",
    "scene": "chinese",
    "language": "chinese",
    "voice_id": "male-qn-qingse",
    "speed": 0.85,
    "pause_dou_hao_ms": 350,
    "pause_ju_hao_ms": 600,
    "subtitle_type": "sentence"
  }'
```

---

## 3. WS /api/v1/tts/ws — 流式合成（首包延迟敏感场景）

### 3.1 何时用

- 需要**逐帧播放**（首包后立即播，不需要等全文合成完）
- 单词跟读、口语训练
- 业务方能维护 WebSocket 连接

### 3.2 协议

#### 上行（业务方 → 服务端）

```json
// 1) init（必须第一条）
{"op":"start", "token":"...", "text":"Hello", "voice_id":"English_PassionateWarrior", "language":"english", "subtitle_type":"word_streaming"}

// 2) 追加文本（可选）
{"op":"send", "text":" world"}

// 3) 结束（可选；服务端会自动结束）
{"op":"end"}
```

#### 下行（服务端 → 业务方）

```json
// 启动确认
{"op":"started", "raw": {...原始 Minimax started 帧...}}

// 透传的原始 Minimax 数据帧（含 audio 十六进制）
{"event":"task_continued", "data":{"audio":"aabbccdd..."}, "is_final":false, ...}

// 业务侧约定的结束信号（服务端包装）
{"op":"finished", "raw": {...最后一帧...}}

// 错误
{"op":"error", "msg":"..."}
```

**关键**：Minimax **不会**发 `task_finished` 事件，结束信号就是**最后一帧 `is_final: true`**。服务端检测到该字段后包装一个 `op:finished` 给业务方。

### 3.3 init 字段

| 字段 | 必填 | 默认 | 取值 |
|---|---|---|---|
| `op` | ✅ | — | 必须是 `"start"` |
| `token` | ✅ | — | 见上文 |
| `text` | ❌ | `""` | 第一段文本（可后续 `op=send` 追加） |
| `voice_id` | ❌ | `English_PassionateWarrior` | |
| `language` | ❌ | `english` | english/chinese/cantonese/auto |
| `speed` | ❌ | 1.0 | 0.5-2.0（越界自动夹紧） |
| `vol` | ❌ | 1.0 | 0.0-10.0 |
| `pitch` | ❌ | 0 | -12-12 |
| `subtitle_type` | ❌ | `word_streaming` | word_streaming 适合流式 |
| `model` | ❌ | 默认 | |
| `sample_rate` | ❌ | 32000 | 8000-44100 |
| `bitrate` | ❌ | 128000 | 32000-192000 |
| `fmt` | ❌ | mp3 | mp3/pcm/wav |
| `channel` | ❌ | 1 | 1/2 |

### 3.4 接入示例（JavaScript）

```js
const ws = new WebSocket("ws://127.0.0.1:8000/api/v1/tts/ws");
const audioChunks = [];   // hex 字符串
let firstChunkAt = null;

ws.onopen = () => {
  ws.send(JSON.stringify({
    op: "start",
    token: "listen-eng-2025-secret-key",
    text: "Hello, nice to meet you.",
    voice_id: "English_PassionateWarrior",
    language: "english",
    subtitle_type: "word_streaming",
  }));
};

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.op === "started") {
    console.log("synth started");
  } else if (m.op === "finished") {
    // 全部到齐，组装 MP3
    const audio = m4a_chunks_to_blob(audioChunks);  // 自己实现
    new Audio(URL.createObjectURL(audio)).play();
  } else if (m.op === "error") {
    console.error(m.msg);
  } else {
    // 透传原始帧
    const audio = m.data?.audio || m.raw?.data?.audio;
    if (audio) {
      if (!firstChunkAt) firstChunkAt = Date.now();
      audioChunks.push(audio);
    }
  }
};

ws.onclose = () => console.log("closed");
```

### 3.5 常见错误

| 触发 | 收到的帧 |
|---|---|
| 没传 token | `{"op":"error","msg":"ws auth failed: bad token"}` |
| 第一条不是 `start` | `{"op":"error","msg":"first message must be {op:start,...}"}` |
| Minimax 启动失败 | `{"op":"error","msg":"task start failed","raw":{...}}` |
| 客户端主动断开 | 服务端自动给 Minimax 发 `task_finish` |

---

## 4. POST /api/v1/tts/article — 提交异步任务

> 适合**长文本**（>3000 字 或 `scene=article`）。

### 4.1 请求体

与 `synthesize` 完全相同。`scene` 字段强制被服务端改为 `article`。

### 4.2 响应

```json
{
  "task_id": "419639875756456",
  "cache_key": "article:english:English_expressive_narrator:1.0:1.0:0:2af5be...",
  "status": "processing"
}
```

### 4.3 轮询

```bash
# 普通查
curl "http://127.0.0.1:8000/api/v1/tts/article/419639875756456?token=..."

# ?force=1 强制重查远端（绕开本地缓存的终态）
curl "http://127.0.0.1:8000/api/v1/tts/article/419639875756456?force=1&token=..."
```

### 4.4 任务状态机

```
submitted → processing → success → (有 audio_url，可下载)
                    ↘ failed    → (有 error 字段)
```

查询响应：
```json
{
  "task_id": "419639875756456",
  "status": "success",       // processing / success / failed
  "progress": 100,            // 0-100
  "audio_url": "/static/tts/article/auto/English_expressive_narrator/a1/b2.mp3?token=...",
  "error": null
}
```

| `status` | 含义 | 客户端建议 |
|---|---|---|
| `processing` | 远端还在合成 | 等待 2-5 秒后重试 |
| `success` | 完成，`audio_url` 可用 | 下载并播放 |
| `failed` | 失败，`error` 有详情 | 重试或改 `voice_id` |

---

## 5. GET /api/v1/tts/tasks — 任务列表

```bash
curl "http://127.0.0.1:8000/api/v1/tts/tasks?limit=10&token=..."
```

| 参数 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `limit` | int | 20 | 1-100 |

响应：
```json
{
  "items": [
    {"task_id":"...", "cache_key":"...", "status":"success", "progress":100,
     "audio_url":"/static/tts/...", "error":null, "created_at":1736000000},
    ...
  ],
  "total": 5
}
```

`created_at` 是 Unix 秒。

---

## 6. GET /api/v1/tts/meta — 元信息（音色目录）

```bash
curl "http://127.0.0.1:8000/api/v1/tts/meta?token=..."
```

响应（节选）：
```json
{
  "voices": [
    {"voice_id":"English_PassionateWarrior","name_zh":"热血成年男","name_en":"Passionate Warrior","gender":"male","lang":"english","style":"expressive"},
    {"voice_id":"male-qn-qingse","name_zh":"清澈男声","name_en":"Qingse Male","gender":"male","lang":"chinese","style":"narration"}
  ],
  "models": [
    {"id":"speech-2.8-turbo","name":"Turbo","desc":"实时高频场景：单词/短句"},
    {"id":"speech-2.8-hd","name":"HD","desc":"文章预生成：高保真"}
  ],
  "languages": [
    {"code":"english","name":"英文","boost":"English"},
    {"code":"chinese","name":"中文","boost":"Chinese"},
    {"code":"cantonese","name":"粤语","boost":"Chinese,Yue"},
    {"code":"auto","name":"自动","boost":"auto"}
  ],
  "subtitle_types": [
    {"code":"none","name":"无字幕","hint":""},
    {"code":"sentence","name":"按句","hint":"适合一般阅读"},
    {"code":"word","name":"按词","hint":"适合单词卡"},
    {"code":"word_streaming","name":"逐词流式","hint":"WS 端用"}
  ],
  "speed_range": [0.5, 2.0],
  "vol_range": [0.0, 10.0],
  "pitch_range": [-12, 12],
  "sample_rates": [8000, 16000, 24000, 32000, 44100],
  "bitrates": [32000, 64000, 128000, 192000],
  "channels": [1, 2],
  "formats": ["mp3", "pcm", "wav"],
  "scenes": ["word", "sentence", "chinese", "article", "general"],
  "default_voice_en": "English_PassionateWarrior",
  "default_voice_zh": "male-qn-qingse"
}
```

---

## 7. 缓存接口

### 7.1 GET /api/v1/tts/cache/stats

```bash
curl "http://127.0.0.1:8000/api/v1/tts/cache/stats?token=..."
```

```json
{"total": 42, "total_bytes": 524288, "total_hits": 128}
```

### 7.2 GET /api/v1/tts/cache/recent

| 参数 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `limit` | int | 50 | 1-500 |
| `language` | string | `null`（全部） | `english` / `chinese` / `cantonese` / `auto` / `article` |

```json
{
  "items": [
    {
      "cache_key": "word:english:English_PassionateWarrior:1.0:1.0:0:...",
      "text": "hello",
      "voice_id": "English_PassionateWarrior",
      "model": "speech-2.8-turbo",
      "language": "english",
      "audio_url": "/static/tts/word/english/English_PassionateWarrior/1f/3870be27.mp3",
      "file_size": 14964,
      "duration_ms": 828,
      "hit_count": 3,
      "last_access_at": 1736000000,
      "is_permanent": 1
    }
  ],
  "total": 1
}
```

### 7.3 自动命中规则

任何合成接口只要 cache hit，**`hit_count` 自动 +1，`last_access_at` 更新**。
业务方不需要手动标记。

### 7.4 cache_key 算法（决定什么时候命中）

`md5(scene|language|voice_id|speed|vol|pitch|model|subtitle_type|sample_rate|bitrate|fmt|poetry_pauses_ms|text)`

**含义**：上述任一参数变化都视为不同音频，**不会**误命中。
- 同 `text` + 不同 `vol=1` vs `vol=2` → 两条独立缓存 ✓
- 同 `text` + 不同 `pause_ju_hao_ms` → 两条独立缓存 ✓
- 同 `text` + 不同 `voice_id` → 两条独立缓存 ✓

### 7.5 POST /api/v1/tts/cache/cleanup — 清理临时缓存

| 参数 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `ttl_seconds` | int | 604800（7天） | 60-31536000（1分-1年） |

```json
{"removed": 3, "ttl_seconds": 604800}
```

约束：
- `is_permanent=1`（教材/单词/古诗库）**永远不会**被删
- 删的是 `(now - last_access_at) > ttl_seconds AND is_permanent = 0` 的行 + 对应磁盘文件
- 推荐每周跑一次（crontab）

```cron
0 3 * * 1 curl -X POST "http://127.0.0.1:8000/api/v1/tts/cache/cleanup" -H "Authorization: Bearer <TOKEN>"
```

---

## 8. 错误码 + 错误响应体

### 8.1 错误响应格式

```json
{"detail": "invalid or missing token"}
```

或者 Pydantic 校验失败：
```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body"],
      "msg": "Value error, scene 必须是 ['word', 'sentence', 'chinese', 'article', 'general'] 之一, got 'bogus'",
      "ctx": {"error": "scene 必须是 [...] 之一, got 'bogus'"},
      "input": {"text": "hi", "scene": "bogus"}
    }
  ]
}
```

注意 `msg` 字段开头是 `"Value error, "`（Pydantic v2 自动加），正文在 `ctx.error` 字段。

### 8.2 错误码

| HTTP | 含义 | 处理建议 |
|---|---|---|
| **401** | token 缺失或错误 | 检查 token，从 `API_TOKEN` 重新拉 |
| **400** | 文本清洗后为空 / 全部控制字符 | 检查 `text` 内容 |
| **404** | `task_id` 不存在 | 检查是否已被清理 |
| **422** | 请求体字段不合法 | 校验字段类型（speed/scene/language/sample_rate/bitrate/fmt 等） |
| **500** | Minimax 服务端错误 / 服务内部错误 | 服务端日志 |

> `401` 时前端**不要自动重试**，先查 token 是否配错。

业务方拿到 500 后建议：
1. 等 1-2 秒后重试一次；
2. 若是异步任务，等 60 秒没返回 success 就用 `?force=1` 强刷；
3. 三次失败后降级到浏览器原生 `SpeechSynthesis`。

---

## 9. 部署与运维

### 9.1 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `MINIMAX_API_KEY` | 已内置（仅供测试） | **生产必改**，从环境变量配置 |
| `MINIMAX_BASE_HTTP` | `https://api.minimaxi.com` | 备用域 `https://api-bj.minimaxi.com` |
| `API_TOKEN` | `listen-eng-2025-secret-key` | **公网部署前必改**，长度 ≥ 32 字符 |
| `AUTH_ENABLED` | `true` | 设 `false` 可临时关掉鉴权（仅调试） |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | 公网改成 `0.0.0.0` |

### 9.2 Makefile 快捷命令

```bash
make install     # pip install -r requirements.txt
make run         # uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
make test        # pytest tests/ -v
make health      # curl http://127.0.0.1:8000/healthz
make synth-word WORD=hello  # 单个单词合成
```

### 9.3 反向代理（Nginx 范例）

```nginx
location /api/v1/tts/ {
    proxy_pass http://127.0.0.1:8000/api/v1/tts/;
    proxy_set_header Authorization $http_authorization;
    proxy_read_timeout 180s;  # 异步任务等
}

# WebSocket
location /api/v1/tts/ws {
    proxy_pass http://127.0.0.1:8000/api/v1/tts/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 9.4 安全说明

- `voice_id` 和 `model` 会被过滤：路径穿越字符（`..`、`.`、`/`）被替换为 `_DOT_` / `_`
- SQL 注入已用参数化防护，业务方传 `'; DROP TABLE` 等内容不会执行
- 静态文件禁止路径穿越（`/static/tts/../etc/passwd` 返回 404）
- 错误响应已脱敏，不返回内部堆栈

---

## 10. 项目结构

```
listen-eng/
├── API.md                       # 本文档
├── Makefile                     # make install/run/test/health
├── .env.example                 # 配置模板
├── requirements.txt
├── app/                         # 源码 ~3050 行
│   ├── main.py                  # FastAPI 入口 + /static 中间件
│   ├── core/                    # config / auth / voices
│   ├── db/                      # database / cache_repo / async_task_repo
│   ├── services/                # sanitize / storage / tts_service + 3 adapters
│   └── api/                     # 10 个路由 + Pydantic 模型
├── static/index.html            # 测试页面 UI
└── tests/                       # 189 个单元 + 集成测试
    ├── test_schemas.py          # 88 个字段边界
    ├── test_security.py         # 路径穿越 + SQL 注入 + DoS
    ├── test_service_routes.py   # 路由 + 鉴权边界
    ├── test_api.py / test_ws.py / test_voices.py / test_storage.py / ...
```

---

## 11. 完整接入示例（Python 一站式）

```python
import requests

class TTSClient:
    def __init__(self, base="http://127.0.0.1:8000", token="listen-eng-2025-secret-key"):
        self.base = base
        self.token = token
        self._headers = {"Authorization": f"Bearer {token}"}

    def synthesize(self, text, scene="general", voice_id="English_PassionateWarrior",
                   language="english", speed=1.0, vol=1.0, pitch=0,
                   fmt="mp3", subtitle_type="none",
                   pause_dou_hao_ms=200, pause_ju_hao_ms=350, pause_dun_hao_ms=250):
        """同步合成，返回 (audio_url, duration_ms, file_size, cache)。"""
        r = requests.post(
            f"{self.base}/api/v1/tts/synthesize",
            headers={**self._headers, "Content-Type": "application/json"},
            json={
                "text": text, "scene": scene, "voice_id": voice_id,
                "language": language, "speed": speed, "vol": vol, "pitch": pitch,
                "fmt": fmt, "subtitle_type": subtitle_type,
                "pause_dou_hao_ms": pause_dou_hao_ms,
                "pause_ju_hao_ms": pause_ju_hao_ms,
                "pause_dun_hao_ms": pause_dun_hao_ms,
            },
        )
        r.raise_for_status()
        d = r.json()
        return d["audio_url"], d["duration_ms"], d["file_size"], d["cache"]

    def play_url(self, audio_url):
        """拼 token 给浏览器/HTML audio 用。"""
        sep = "&" if "?" in audio_url else "?"
        return f"{self.base}{audio_url}{sep}token={self.token}"

    def get_voices(self):
        """拉音色目录。"""
        r = requests.get(f"{self.base}/api/v1/tts/meta", headers=self._headers)
        r.raise_for_status()
        return r.json()["voices"]


# 用法
tts = TTSClient()
url, dur, size, cache = tts.synthesize("hello world", scene="sentence", voice_id="English_Graceful_Lady")
print(f"{cache}: {url}  ({dur}ms, {size}B)")
print("Play:", tts.play_url(url))
```

### 流式（JavaScript）

```js
class TTSStream {
  constructor(base, token) {
    this.base = base; this.token = token;
    this.ws = null;
    this.chunks = [];
    this.onFinish = null;
    this.onError = null;
  }

  open() {
    this.ws = new WebSocket(`${this.base.replace("http","ws")}/api/v1/tts/ws`);
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.op === "finished") {
        const blob = this._chunksToBlob();
        this.onFinish?.(blob);
      } else if (m.op === "error") {
        this.onError?.(m.msg);
      } else {
        const audio = m.data?.audio || m.raw?.data?.audio;
        if (audio) this.chunks.push(audio);
      }
    };
  }

  send(text, voice_id = "English_PassionateWarrior", language = "english",
       subtitle_type = "word_streaming") {
    this.ws.send(JSON.stringify({
      op: "start", token: this.token,
      text, voice_id, language, subtitle_type,
    }));
  }

  close() {
    this.ws?.send(JSON.stringify({op: "end"}));
    setTimeout(() => this.ws?.close(), 200);
  }

  _chunksToBlob() {
    const bytes = this.chunks.map(hex => Uint8Array.from(atob(hex), c => c.charCodeAt(0)));
    return new Blob(bytes, {type: "audio/mpeg"});
  }
}

// 用法
const tts = new TTSStream("http://127.0.0.1:8000", "listen-eng-2025-secret-key");
tts.onFinish = (blob) => new Audio(URL.createObjectURL(blob)).play();
tts.onError = (msg) => console.error(msg);
tts.open();
tts.send("Hello, world!");
```