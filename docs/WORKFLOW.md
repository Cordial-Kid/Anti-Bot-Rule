# Engineering Workflow

## 1. Collect Fingerprints

Browser fingerprint records are stored in MySQL source table `fingerprints_sample`.

Expected columns:

| Column | Meaning |
|---|---|
| `id` | Source event id |
| `username` | User identifier |
| `click_time` | Browser-side collection time |
| `rest_json` | Raw fingerprint JSON |

Optional context columns are also preserved when present: `url`, `delta_time`, `created_at`, `cookie_hash`, `canvas_hash`, `webgl_hash`, `fonts_hash`, `user_agent`, and `ip`.

`rest_json` contains:

- `leve1`: basic browser signals
- `leve2`: consistency and hardware/browser signals
- `level3`: advanced API and fingerprint stability signals
- `keyboard`, `mousemove`, `llmNature`: behavioral and DOM automation signals

The reader maps `click_time` to the pipeline's internal `timestamp` field and still accepts the older `json_field` / `level1Signals` / `level2Signals` / `level3Signals` payload shape.

## 2. Run Rule Pipeline

Entrypoint:

```powershell
python main.py
```

By default, the pipeline reads and writes in batches controlled by
`ANTIBOT_BATCH_SIZE`. Each batch is read with `WHERE id > last_id ORDER BY id
LIMIT ANTIBOT_BATCH_SIZE`, scored, and appended to the result tables. Set
`ANTIBOT_MAX_ROWS` for a small test run, or set `ANTIBOT_BATCH_SIZE=0` to use
the legacy one-shot read.

Actual code path:

```text
main.py
pipeline/main.py
pipeline/data_read.py
pipeline/levels/level_1.py
pipeline/levels/level_2.py
pipeline/levels/level_3.py
pipeline/score.py
pipeline/save_to_sql.py
```

## 3. Persist Results

The pipeline writes:

- `bot_detection_results`: final score, level scores, risk level, suggested action.
- `bot_rule_hits`: structured rule hit explanations.

## 4. Serve Backend APIs

`backend/server.js` is read-only against the result tables.

Core APIs:

- `GET /api/v1/stats/defense`
- `GET /api/v1/stats/purity`
- `GET /api/v1/logs/live`
- `GET /api/v1/logs/scatter`
- `GET /api/v1/detections`
- `GET /api/v1/rules/top`

## 5. Render Dashboard

`frontend/` calls the backend through `/api` in development, proxied by Vite.

In production, use Nginx to serve `frontend/dist` and reverse-proxy `/api` to the backend process.
