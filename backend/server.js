import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import mysql from 'mysql2/promise'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

function loadLocalEnv() {
  if (!fs.existsSync('.env')) return
  const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const app = express()
const PORT = Number(process.env.PORT || 8080)
const startedAt = Date.now()

const RESULT_TABLE = process.env.ANTIBOT_RESULT_TABLE || 'bot_detection_results'
const RULE_HIT_TABLE = process.env.ANTIBOT_RULE_HIT_TABLE || 'bot_rule_hits'
const USERNAME_HASH_SALT = String(process.env.USERNAME_HASH_SALT ?? 'dashboard-privacy-salt')

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const BLOCKING_ACTIONS = ['challenge', 'block']
const HIGH_RISK_LEVELS = ['medium_high', 'high']

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '64kb' }))

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/', apiLimiter)

function quoteIdentifier(identifier) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`)
  }
  return `\`${identifier}\``
}

function mysqlConfig() {
  if (process.env.ANTIBOT_DB_URL) {
    return process.env.ANTIBOT_DB_URL
  }

  return {
    host: process.env.ANTIBOT_DB_HOST || 'localhost',
    port: Number(process.env.ANTIBOT_DB_PORT || 3306),
    user: process.env.ANTIBOT_DB_USER || 'root',
    password: process.env.ANTIBOT_DB_PASSWORD || '',
    database: process.env.ANTIBOT_DB_NAME || 'anti_bot',
    charset: process.env.ANTIBOT_DB_CHARSET || 'utf8mb4',
    waitForConnections: true,
    connectionLimit: Number(process.env.ANTIBOT_DB_POOL || 10),
  }
}

const pool = mysql.createPool(mysqlConfig())
const resultTableSql = quoteIdentifier(RESULT_TABLE)
const ruleHitTableSql = quoteIdentifier(RULE_HIT_TABLE)

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num))
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function hashUsername(rawUsername) {
  const source = String(rawUsername ?? '').trim()
  if (!source) return 'Anonymous'
  if (/^U-[a-f0-9]{12}$/i.test(source)) return source

  const digest = createHash('sha256')
    .update(`${USERNAME_HASH_SALT}:${source}`)
    .digest('hex')

  return `U-${digest.slice(0, 12)}`
}

function formatUptime() {
  const diff = Date.now() - startedAt
  const totalHours = Math.floor(diff / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return `${days}天 ${hours}小时`
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function classifyAction(row) {
  const action = String(row.suggested_action ?? '').toLowerCase()
  const level = String(row.risk_level ?? '').toLowerCase()
  const riskScore = asNumber(row.risk_score)
  const blocked = BLOCKING_ACTIONS.includes(action) || HIGH_RISK_LEVELS.includes(level) || riskScore >= 45

  return {
    blocked,
    type: blocked ? 'block' : 'detect',
    label: blocked ? '拦截' : '检测',
  }
}

function parseJson(value, fallback) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function buildTimeRange(days) {
  const end = new Date()
  const start = new Date(end)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return { start, end }
}

function parseRequestedDays(question = '') {
  const match = String(question).match(/(\d{1,3})\s*(天|日|day|days)/i)
  return clamp(match ? Number(match[1]) : 10, 1, 90)
}

function inferIntent(question = '') {
  const text = String(question).toLowerCase()
  if (/(bot|机器人|流量|趋势|数量|占比)/.test(text)) return 'bot_traffic_by_days'
  if (/(高风险|可疑|suspicious|high risk|风险)/.test(text)) return 'high_risk_summary'
  if (/(规则|原因|命中|rule)/.test(text)) return 'top_rules'
  if (/(ip|来源|网段|热点|区域)/.test(text)) return 'ip_hotspots'
  return 'unknown'
}

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function getTotalCount() {
  const rows = await query(`SELECT COUNT(*) AS total FROM ${resultTableSql}`)
  return asNumber(rows[0]?.total)
}

async function getBlockedCount(whereSql = '', params = []) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM ${resultTableSql}
     WHERE (${BLOCKING_ACTIONS.map(() => 'suggested_action = ?').join(' OR ')}
        OR ${HIGH_RISK_LEVELS.map(() => 'risk_level = ?').join(' OR ')}
        OR risk_score >= 45)
        ${whereSql}`,
    [...BLOCKING_ACTIONS, ...HIGH_RISK_LEVELS, ...params],
  )
  return asNumber(rows[0]?.total)
}

app.get('/health', async (_req, res) => {
  try {
    const total = await getTotalCount()
    res.json({
      ok: true,
      service: 'anti-bot-mysql-backend',
      storage: 'mysql',
      resultTable: RESULT_TABLE,
      ruleHitTable: RULE_HIT_TABLE,
      totalResults: total,
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

app.get('/api/v1/stats/defense', async (_req, res) => {
  const totalRequests = await getTotalCount()
  const totalBlocked = await getBlockedCount()
  const todayBlocked = await getBlockedCount(
    'AND DATE(COALESCE(event_time, created_at)) = CURDATE()',
  )

  res.json({
    totalBlocked,
    todayBlocked,
    totalRequests,
    uptime: formatUptime(),
    activeDefense: true,
  })
})

app.get('/api/v1/stats/purity', async (_req, res) => {
  const totals = await query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN risk_score >= 45 OR risk_level IN ('medium_high', 'high') THEN 1 ELSE 0 END) AS bot_total,
       AVG(risk_score) AS avg_risk
     FROM ${resultTableSql}`,
  )
  const total = asNumber(totals[0]?.total)
  const botTotal = asNumber(totals[0]?.bot_total)
  const botTrafficPct = total > 0 ? Number(((botTotal / total) * 100).toFixed(1)) : 0
  const normalTrafficPct = Number((100 - botTrafficPct).toFixed(1))
  const purityScore = clamp(Math.round(normalTrafficPct), 0, 100)

  const hourlyRows = await query(
    `SELECT
       HOUR(COALESCE(event_time, created_at)) AS hour,
       COUNT(*) AS total,
       SUM(CASE WHEN risk_score >= 45 OR risk_level IN ('medium_high', 'high') THEN 1 ELSE 0 END) AS bots
     FROM ${resultTableSql}
     WHERE COALESCE(event_time, created_at) >= DATE_SUB(NOW(), INTERVAL 12 HOUR)
     GROUP BY HOUR(COALESCE(event_time, created_at))
     ORDER BY MIN(COALESCE(event_time, created_at)) ASC`,
  )
  const hourlyHistory = hourlyRows.map((row) => {
    const rowTotal = asNumber(row.total)
    const rowBots = asNumber(row.bots)
    return rowTotal > 0 ? Math.round(100 - ((rowBots / rowTotal) * 100)) : 100
  })

  const dailyRows = await query(
    `SELECT
       DATE(COALESCE(event_time, created_at)) AS day,
       COUNT(*) AS total,
       SUM(CASE WHEN risk_score >= 45 OR risk_level IN ('medium_high', 'high') THEN 1 ELSE 0 END) AS bots
     FROM ${resultTableSql}
     WHERE COALESCE(event_time, created_at) >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
     GROUP BY DATE(COALESCE(event_time, created_at))
     ORDER BY day ASC`,
  )
  const dailyBotHistory = dailyRows.map((row) => {
    const rowTotal = asNumber(row.total)
    const rowBots = asNumber(row.bots)
    return rowTotal > 0 ? Number(((rowBots / rowTotal) * 100).toFixed(1)) : 0
  })

  const trend = dailyBotHistory.length < 2
    ? 'stable'
    : dailyBotHistory.at(-1) < dailyBotHistory.at(-2)
      ? 'improving'
      : dailyBotHistory.at(-1) > dailyBotHistory.at(-2)
        ? 'degrading'
        : 'stable'

  res.json({
    normalTrafficPct,
    botTrafficPct,
    purityScore,
    trend,
    hourlyHistory,
    dailyBotHistory,
  })
})

app.get('/api/v1/stats/spoofing', async (_req, res) => {
  const totalRows = await query(`SELECT COUNT(*) AS total FROM ${ruleHitTableSql}`)
  const total = Math.max(asNumber(totalRows[0]?.total), 1)
  const rows = await query(
    `SELECT
       COALESCE(rule_name, rule_code) AS name,
       COUNT(*) AS count
     FROM ${ruleHitTableSql}
     GROUP BY COALESCE(rule_name, rule_code)
     ORDER BY count DESC
     LIMIT 8`,
  )

  res.json(rows.map((row) => ({
    name: String(row.name ?? 'Unknown rule'),
    count: asNumber(row.count),
    pct: Number(((asNumber(row.count) / total) * 100).toFixed(1)),
  })))
})

app.get('/api/v1/stats/locations', async (_req, res) => {
  const rows = await query(
    `SELECT
       SUBSTRING_INDEX(user_ip, '.', 3) AS subnet,
       COUNT(*) AS total,
       SUM(CASE WHEN risk_score >= 45 OR risk_level IN ('medium_high', 'high') THEN 1 ELSE 0 END) AS bots,
       AVG(risk_score) AS avg_risk
     FROM ${resultTableSql}
     WHERE user_ip IS NOT NULL AND user_ip <> ''
     GROUP BY SUBSTRING_INDEX(user_ip, '.', 3)
     ORDER BY bots DESC, total DESC
     LIMIT 8`,
  )

  res.json(rows.map((row, index) => ({
    id: index + 1,
    name: `${row.subnet}.0/24`,
    icon: 'IP',
    activity: clamp(Math.round(asNumber(row.avg_risk)), 5, 99),
    bots: asNumber(row.bots),
    desc: `${asNumber(row.total)} requests`,
    trend: asNumber(row.avg_risk) >= 45 ? 'up' : 'stable',
  })))
})

app.get('/api/v1/logs/live', async (req, res) => {
  const limit = clamp(asNumber(req.query.limit, 14), 1, 50)
  const rows = await query(
    `SELECT id, event_id, user_name, user_ip, user_agent, event_time, created_at, risk_score, risk_level, suggested_action
     FROM ${resultTableSql}
     ORDER BY COALESCE(event_time, created_at) DESC, id DESC
     LIMIT ?`,
    [limit],
  )

  res.json(rows.map((row) => {
    const action = classifyAction(row)
    return {
      id: row.id,
      eventId: row.event_id,
      type: action.type,
      label: action.label,
      // username: hashUsername(row.user_name || row.user_ip || row.event_id),
      username: String(row.user_name || ''),
      userIp: String(row.user_ip || ''),
      userAgent: String(row.user_agent || ''),
      time: formatTime(row.event_time || row.created_at),
      confidence: clamp(Math.round(asNumber(row.risk_score)), 1, 99),
      riskLevel: row.risk_level,
      suggestedAction: row.suggested_action,
    }
  }))
})

app.get('/api/v1/logs/scatter', async (req, res) => {
  const limit = clamp(asNumber(req.query.limit, 120), 10, 500)
  const rows = await query(
    `SELECT
       r.id,
       r.risk_score,
       r.risk_level,
       r.suggested_action,
       r.event_time,
       r.created_at,
       COALESCE(h.hit_count, 0) AS hit_count
     FROM ${resultTableSql} r
     LEFT JOIN (
       SELECT result_id, COUNT(*) AS hit_count
       FROM ${ruleHitTableSql}
       GROUP BY result_id
     ) h ON h.result_id = r.id
     ORDER BY COALESCE(r.event_time, r.created_at) DESC, r.id DESC
     LIMIT ?`,
    [limit],
  )

  res.json(rows.map((row) => ({
    id: row.id,
    riskScore: asNumber(row.risk_score),
    suspiciousSignals: asNumber(row.hit_count),
    verdict: classifyAction(row).blocked ? 'suspicious' : 'normal',
    time: formatTime(row.event_time || row.created_at),
  })))
})

app.get('/api/v1/detections', async (req, res) => {
  const page = Math.max(1, asNumber(req.query.page, 1))
  const pageSize = clamp(asNumber(req.query.pageSize ?? req.query.limit, 20), 1, 100)
  const offset = (page - 1) * pageSize
  const riskLevel = String(req.query.riskLevel ?? req.query.risk_level ?? '').trim()
  const q = String(req.query.q ?? '').trim()

  const where = []
  const params = []
  if (riskLevel) {
    where.push('risk_level = ?')
    params.push(riskLevel)
  }
  if (q) {
    where.push('(user_name LIKE ? OR user_ip LIKE ? OR user_agent LIKE ? OR CAST(event_id AS CHAR) LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRows = await query(`SELECT COUNT(*) AS total FROM ${resultTableSql} ${whereSql}`, params)
  const rows = await query(
    `SELECT
       id, save_batch_id, event_id, user_name, user_ip, user_agent, event_time, detected_at, created_at,
       level1_score, level2_score, level3_score,
       level1_raw_score, level2_raw_score, level3_raw_score,
       risk_score, risk_level, suggested_action,
       level1_reasons, level2_reasons, level3_reasons, all_reasons, all_rule_hits
     FROM ${resultTableSql}
     ${whereSql}
     ORDER BY COALESCE(event_time, created_at) DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )

  res.json({
    page,
    pageSize,
    total: asNumber(totalRows[0]?.total),
    items: rows.map((row) => ({
      ...row,
      eventDate: formatDate(row.event_time || row.created_at),
      eventTimeText: formatTime(row.event_time || row.created_at),
      all_reasons: parseJson(row.all_reasons, []),
      all_rule_hits: parseJson(row.all_rule_hits, []),
    })),
  })
})

app.get('/api/v1/detections/:id', async (req, res) => {
  const id = asNumber(req.params.id)
  const rows = await query(
    `SELECT *
     FROM ${resultTableSql}
     WHERE id = ?
     LIMIT 1`,
    [id],
  )
  if (!rows.length) return res.status(404).json({ error: 'detection not found' })

  const hits = await query(
    `SELECT id, level, rule_code, rule_name, weight, reason, created_at
     FROM ${ruleHitTableSql}
     WHERE result_id = ?
     ORDER BY level ASC, id ASC`,
    [id],
  )

  const row = rows[0]
  res.json({
    ...row,
    all_reasons: parseJson(row.all_reasons, []),
    all_rule_hits: parseJson(row.all_rule_hits, []),
    ruleHits: hits,
  })
})

app.get('/api/v1/rules/top', async (req, res) => {
  const limit = clamp(asNumber(req.query.limit, 20), 1, 100)
  const rows = await query(
    `SELECT level, rule_code, COALESCE(rule_name, rule_code) AS rule_name, COUNT(*) AS hits, AVG(weight) AS avg_weight
     FROM ${ruleHitTableSql}
     GROUP BY level, rule_code, COALESCE(rule_name, rule_code)
     ORDER BY hits DESC
     LIMIT ?`,
    [limit],
  )
  res.json(rows.map((row) => ({
    level: asNumber(row.level),
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    hits: asNumber(row.hits),
    avgWeight: Number(asNumber(row.avg_weight).toFixed(2)),
  })))
})

app.post('/api/v1/fingerprint/analyze', async (req, res) => {
  const fp = req.body ?? {}
  const suspiciousSignals = [
    fp?.level3?.webdriver === true,
    fp?.level3?.noPlugins === true,
    fp?.level3?.chromeMismatch === true,
    fp?.level2Canvas?.canvasSpoofed === true,
  ].filter(Boolean).length
  const riskScore = clamp(20 + suspiciousSignals * 25, 0, 100)

  res.json({
    source: 'mysql-backend',
    storage: 'mysql-readonly',
    suspiciousSignals,
    riskScore,
    verdict: riskScore >= 45 ? 'suspicious' : 'normal',
    receivedAt: new Date().toISOString(),
  })
})

app.post('/api/v1/agent/query', async (req, res) => {
  const question = String(req.body?.question ?? '').trim()
  if (!question) {
    return res.status(400).json({ error: 'question is required' })
  }

  if (/(insert|update|delete|drop|truncate|alter|写入|删除|修改|更新)/i.test(question)) {
    return res.status(403).json({
      intent: 'forbidden',
      answer: '当前 Agent 只支持只读查询，不执行写入或修改操作。',
      meta: { readOnly: true },
    })
  }

  const beginAt = Date.now()
  const intent = inferIntent(question)
  const days = parseRequestedDays(question)
  const range = buildTimeRange(days)

  if (intent === 'bot_traffic_by_days') {
    const rows = await query(
      `SELECT
         DATE(COALESCE(event_time, created_at)) AS day,
         COUNT(*) AS total_count,
         SUM(CASE WHEN risk_score >= 45 OR risk_level IN ('medium_high', 'high') THEN 1 ELSE 0 END) AS bot_count
       FROM ${resultTableSql}
       WHERE COALESCE(event_time, created_at) BETWEEN ? AND ?
       GROUP BY DATE(COALESCE(event_time, created_at))
       ORDER BY day ASC`,
      [range.start, range.end],
    )
    const series = rows.map((row) => ({
      date: formatDate(row.day),
      botCount: asNumber(row.bot_count),
      totalCount: asNumber(row.total_count),
    }))
    const totalBotTraffic = series.reduce((sum, row) => sum + row.botCount, 0)
    const totalTraffic = series.reduce((sum, row) => sum + row.totalCount, 0)
    const botRatio = totalTraffic > 0 ? Number(((totalBotTraffic / totalTraffic) * 100).toFixed(2)) : 0

    return res.json({
      intent,
      data: {
        series,
        summary: {
          days,
          totalBotTraffic,
          totalTraffic,
          avgBotTraffic: series.length ? Math.round(totalBotTraffic / series.length) : 0,
          botRatio,
        },
      },
      answer: `过去 ${days} 天 Bot/高风险流量共 ${totalBotTraffic} 条，占全部检测 ${botRatio}%。`,
      meta: { readOnly: true, elapsedMs: Date.now() - beginAt },
    })
  }

  if (intent === 'high_risk_summary') {
    const rows = await query(
      `SELECT risk_level, COUNT(*) AS count, AVG(risk_score) AS avg_risk
       FROM ${resultTableSql}
       WHERE COALESCE(event_time, created_at) BETWEEN ? AND ?
       GROUP BY risk_level
       ORDER BY avg_risk DESC`,
      [range.start, range.end],
    )
    const total = rows.reduce((sum, row) => sum + asNumber(row.count), 0)
    const highRisk = rows
      .filter((row) => HIGH_RISK_LEVELS.includes(String(row.risk_level)))
      .reduce((sum, row) => sum + asNumber(row.count), 0)

    return res.json({
      intent,
      data: { days, total, highRisk, distribution: rows },
      answer: `过去 ${days} 天共有 ${total} 条检测记录，其中中高及高风险 ${highRisk} 条。`,
      meta: { readOnly: true, elapsedMs: Date.now() - beginAt },
    })
  }

  if (intent === 'top_rules') {
    const rows = await query(
      `SELECT COALESCE(rule_name, rule_code) AS name, COUNT(*) AS hits
       FROM ${ruleHitTableSql}
       GROUP BY COALESCE(rule_name, rule_code)
       ORDER BY hits DESC
       LIMIT 5`,
    )
    return res.json({
      intent,
      data: { topRules: rows },
      answer: rows[0]
        ? `当前命中最多的规则是「${rows[0].name}」，共 ${rows[0].hits} 次。`
        : '当前没有规则命中数据。',
      meta: { readOnly: true, elapsedMs: Date.now() - beginAt },
    })
  }

  if (intent === 'ip_hotspots') {
    const rows = await query(
      `SELECT user_ip, COUNT(*) AS total, AVG(risk_score) AS avg_risk
       FROM ${resultTableSql}
       WHERE user_ip IS NOT NULL AND user_ip <> ''
       GROUP BY user_ip
       ORDER BY avg_risk DESC, total DESC
       LIMIT 5`,
    )
    return res.json({
      intent,
      data: { hotspots: rows },
      answer: rows[0]
        ? `当前风险最高的 IP 是 ${rows[0].user_ip}，平均风险分 ${Number(rows[0].avg_risk).toFixed(2)}。`
        : '当前没有可用 IP 数据。',
      meta: { readOnly: true, elapsedMs: Date.now() - beginAt },
    })
  }

  return res.json({
    intent: 'unsupported',
    data: null,
    answer: '我目前支持查询 Bot 流量趋势、高风险样本、规则命中和 IP 热点。',
    meta: { readOnly: true, elapsedMs: Date.now() - beginAt },
  })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend started: http://localhost:${PORT}`)
  console.log(`MySQL result table: ${RESULT_TABLE}`)
  console.log(`MySQL rule hit table: ${RULE_HIT_TABLE}`)
})
