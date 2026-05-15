# Anti Bot Rule 使用说明

这是一个基于浏览器指纹数据的反自动化检测项目。项目会从 MySQL 原始数据表读取浏览器指纹，按 Level 1/2/3 规则评分，再把检测结果写入 MySQL 结果表，最后由 Node 后端和 React 前端展示。

## 1. 项目流程

```text
MySQL 原始表 bfp_event
        |
        v
Python pipeline 分批读取、解析、评分
        |
        v
bot_detection_results + bot_rule_hits
        |
        v
Node.js backend API
        |
        v
React frontend dashboard
```

## 2. 目录结构

```text
anti-bot-rule/
├── main.py                    # Python pipeline 入口
├── .env                       # Python pipeline 数据库配置
├── pipeline/                  # 读取、评分、写库逻辑
│   ├── main.py
│   ├── data_read.py
│   ├── save_to_sql.py
│   ├── score.py
│   └── levels/
│       ├── level_1.py
│       ├── level_2.py
│       └── level_3.py
├── backend/                   # Node.js API 服务
│   ├── server.js
│   └── .env                   # 后端数据库配置
├── frontend/                  # React 前端
│   ├── src/
│   └── .env.local             # 前端 API 配置
└── docs/                      # 辅助文档
```

## 3. 环境要求

需要提前安装：

- Python 3.10+
- Node.js 18+
- MySQL

Python 依赖在 `requirements.txt` 中，主要包括：

```text
pandas
SQLAlchemy
PyMySQL
openpyxl
```

如果没有虚拟环境，可以在项目根目录创建：

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## 4. 原始数据表要求

当前默认读取的原始表是：

```text
anti_bot.bfp_event
```

至少需要包含这些字段：

| 字段 | 说明 |
|---|---|
| `id` | 自增主键，分批读取依赖它 |
| `username` | 用户标识 |
| `url` | 访问 URL |
| `delta_time` | 行为耗时 |
| `click_time` | 事件时间 |
| `cookie_hash` | cookie 指纹 |
| `canvas_hash` | canvas 指纹 |
| `webgl_hash` | webgl 指纹 |
| `fonts_hash` | 字体指纹 |
| `user_agent` | User-Agent |
| `rest_json` | 原始指纹 JSON |
| `created_at` | 入库时间 |

`rest_json` 中当前支持这些结构：

- `leve1`
- `leve2`
- `level3`
- `keyboard`
- `mousemove`
- `llmNature`

注意：原始数据里字段名是 `leve1`、`leve2`，代码已经做了适配。

## 5. 配置 Python pipeline

编辑项目根目录 `.env`：

```env
ANTIBOT_DB_HOST=localhost
ANTIBOT_DB_PORT=3306
ANTIBOT_DB_USER=root
ANTIBOT_DB_PASSWORD=你的MySQL密码
ANTIBOT_DB_NAME=anti_bot
ANTIBOT_DB_CHARSET=utf8mb4

ANTIBOT_SOURCE_TABLE=bfp_event
ANTIBOT_SOURCE_JSON_FIELD=rest_json

ANTIBOT_BATCH_SIZE=10000
ANTIBOT_MAX_ROWS=

ANTIBOT_RESULT_TABLE=bot_detection_results
ANTIBOT_RULE_HIT_TABLE=bot_rule_hits
```

说明：

- `ANTIBOT_SOURCE_TABLE` 是原始数据表。
- `ANTIBOT_SOURCE_JSON_FIELD` 是原始 JSON 字段，当前是 `rest_json`。
- `ANTIBOT_BATCH_SIZE` 是每批处理多少行，默认 `10000`。
- `ANTIBOT_MAX_ROWS` 留空表示处理全部数据；测试时可以设成 `50000`。
- 结果表会自动创建。

## 6. 运行 Python pipeline

在项目根目录执行：

```powershell
.\.venv\Scripts\python.exe main.py
```

运行成功后会看到类似输出：

```text
processed batch 1: source id 1-10000, 10000 source rows, 10000 result rows
...
saved detection results to MySQL in batches: 1086415 result rows, 631839 rule hit rows, 109 batches, batch=xxxx
```

这表示已经写入：

- `bot_detection_results`
- `bot_rule_hits`

如果只想测试前 5 万行，在当前命令行设置：

cmd:

```bat
set ANTIBOT_MAX_ROWS=50000
python main.py
```

PowerShell:

```powershell
$env:ANTIBOT_MAX_ROWS="50000"
python main.py
```

如果要恢复处理全部数据，把 `ANTIBOT_MAX_ROWS` 清空或重新打开终端。

重要：pipeline 默认是追加写入。如果重复运行，会向结果表追加一批新的结果，不会自动清空旧数据。

## 7. 结果表说明

### `bot_detection_results`

一条原始事件对应一条检测结果。

主要字段：

| 字段 | 说明 |
|---|---|
| `save_batch_id` | 一次 pipeline 运行的批次 ID |
| `event_id` | 原始表 `id` |
| `user_name` | 原始 `username` |
| `user_ip` | 当前原始数据没有 IP 时为空 |
| `user_agent` | 原始 User-Agent |
| `event_time` | 原始 `click_time` |
| `level1_score` | Level 1 归一化分数 |
| `level2_score` | Level 2 归一化分数 |
| `level3_score` | Level 3 归一化分数 |
| `risk_score` | 最终风险分 |
| `risk_level` | 风险等级 |
| `suggested_action` | 建议动作 |
| `level1_reasons` | Level 1 命中原因 |
| `level2_reasons` | Level 2 命中原因 |
| `level3_reasons` | Level 3 命中原因 |
| `all_reasons` | 所有原因 JSON |
| `all_rule_hits` | 所有命中规则 JSON |

### `bot_rule_hits`

规则命中明细表。一条检测结果可能有多条规则命中。

主要字段：

| 字段 | 说明 |
|---|---|
| `result_id` | 关联 `bot_detection_results.id` |
| `event_id` | 原始事件 ID |
| `user_name` | 用户标识 |
| `level` | Level 1/2/3 |
| `rule_code` | 规则代码 |
| `rule_name` | 规则名称 |
| `weight` | 规则权重 |
| `reason` | 命中原因 |

## 8. 启动后端

编辑 `backend/.env`：

```env
PORT=8080
CORS_ORIGIN=*

ANTIBOT_DB_HOST=localhost
ANTIBOT_DB_PORT=3306
ANTIBOT_DB_USER=root
ANTIBOT_DB_PASSWORD=你的MySQL密码
ANTIBOT_DB_NAME=anti_bot
ANTIBOT_DB_CHARSET=utf8mb4

ANTIBOT_RESULT_TABLE=bot_detection_results
ANTIBOT_RULE_HIT_TABLE=bot_rule_hits
```

启动：

```powershell
cd backend
npm install
npm run dev
```

检查后端是否正常：

```text
http://127.0.0.1:8080/health
```

常用接口：

```text
GET /api/v1/stats/defense
GET /api/v1/stats/purity
GET /api/v1/logs/live
GET /api/v1/logs/scatter
GET /api/v1/detections
GET /api/v1/rules/top
```

## 9. 启动前端

编辑 `frontend/.env.local`：

```env
VITE_BACKEND_ORIGIN=http://127.0.0.1:8080
VITE_API_BASE_URL=http://127.0.0.1:8080
VITE_API_TIMEOUT_MS=6000
VITE_USE_MOCK=false
VITE_API_FALLBACK_TO_MOCK=false
```

启动：

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开 Vite 输出的地址，一般是：

```text
http://127.0.0.1:5173
```

注意：修改 `frontend/.env.local` 后必须重启前端 dev server。

## 10. 前端数据是不是 mock

前端是否使用 mock 由 `frontend/.env.local` 控制：

```env
VITE_USE_MOCK=false
VITE_API_FALLBACK_TO_MOCK=false
```

建议保持上面配置。这样如果后端接口失败，浏览器控制台会直接报错，而不是悄悄显示 mock 数据。

如果看到这些数字，很可能是 mock：

```text
2,847,xxx
15,xxx
18,924,xxx
```

真实数据可以直接访问后端确认：

```text
http://127.0.0.1:8080/api/v1/stats/defense
```

## 11. 实时拦截日志说明

前端的实时拦截日志不是 WebSocket，也不是网关实时推送，而是前端每 1.4 秒轮询：

```text
GET /api/v1/logs/live?limit=14
```

后端从 `bot_detection_results` 中取最新检测结果：

```sql
ORDER BY COALESCE(event_time, created_at) DESC, id DESC
LIMIT 14
```

当前日志显示原始信息，不做 hash：

- username
- event id
- user ip
- user agent
- risk score

## 12. 常见问题

### 1. 为什么运行时提示表不存在

例如：

```text
Table 'anti_bot.fingerprints' doesn't exist
```

说明当前环境变量指向了错误的源表。检查：

cmd:

```bat
set ANTIBOT
```

PowerShell:

```powershell
Get-ChildItem Env:ANTIBOT*
```

项目使用的是 `ANTIBOT_SOURCE_TABLE`，不是 `ANTIBOT_DB_TABLE`。

### 2. 为什么只处理了一部分数据

检查是否设置了：

```env
ANTIBOT_MAX_ROWS
```

如果它不是空，就只会处理指定行数。

### 3. 为什么前端显示 mock

检查 `frontend/.env.local`：

```env
VITE_USE_MOCK=false
VITE_API_FALLBACK_TO_MOCK=false
```

然后重启前端。

### 4. 为什么重复运行后前端数量变多

结果表是追加写入。重复运行 pipeline 会新增一批结果。可以通过 `save_batch_id` 区分不同运行批次。

如果需要清空旧结果，手动执行 SQL 前请确认数据不再需要：

```sql
TRUNCATE TABLE bot_rule_hits;
TRUNCATE TABLE bot_detection_results;
```

### 5. 100 万行会不会一次性加载到前端

不会。Python pipeline 分批处理；后端接口也主要做分页或聚合查询。前端只拿需要展示的一小段数据。

## 13. 推荐接手顺序

1. 确认 MySQL 原始表 `bfp_event` 存在且字段正确。
2. 配好根目录 `.env`。
3. 先设置 `ANTIBOT_MAX_ROWS=50000` 跑一小批。
4. 确认 `bot_detection_results` 和 `bot_rule_hits` 有数据。
5. 清空测试结果后跑全量。
6. 启动 backend，访问 `/health`。
7. 启动 frontend，确认不是 mock 数据。
