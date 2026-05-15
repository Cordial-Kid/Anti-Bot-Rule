/**
 * API 数据层
 * ─────────────────────────────────────────────────────────
 * 支持两种模式：
 * 1) 本地/真实后端模式（默认）
 * 2) Mock 模式（通过环境变量开启）
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 6000)
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true'
const FALLBACK_TO_MOCK = (import.meta.env.VITE_API_FALLBACK_TO_MOCK ?? 'true') === 'true'

// ═══════════════════════════════════════════════
//  MOCK DATA
// ═══════════════════════════════════════════════

export const MOCK_DEFENSE_STATS = {
  totalBlocked : 2_847_539,
  todayBlocked : 15_234,
  totalRequests: 18_923_740,
  uptime        : '127天 14小时',
  activeDefense : true,
}

export const MOCK_PURITY_DATA = {
  normalTrafficPct: 94.3,
  botTrafficPct   : 5.7,
  purityScore     : 94,
  trend           : 'improving', // 'improving' | 'stable' | 'degrading'
  hourlyHistory   : [97,96,95,93,91,93,95,96,97,95,94,94], // 过去 12 小时
}

export const MOCK_SPOOFING_DATA = [
  { name: 'Windows / Chrome 120',  count: 8_921, pct: 42.1 },
  { name: 'Windows / Edge 120',    count: 3_456, pct: 16.3 },
  { name: 'macOS / Safari 17',     count: 2_108, pct:  9.9 },
  { name: 'Android / Chrome 120',  count: 1_893, pct:  8.9 },
  { name: 'Linux / Firefox 121',   count: 1_567, pct:  7.4 },
  { name: 'iOS / Safari 17',       count: 1_234, pct:  5.8 },
  { name: 'Windows / Firefox 121', count:   987, pct:  4.7 },
  { name: '其他',                   count: 1_054, pct:  4.9 },
]

export const MOCK_ATTACK_LOCATIONS = [
  { id:1, name:'图书馆',       icon:'📚', activity:87, bots:342, desc:'抢座脚本',       trend:'up'    },
  { id:2, name:'教务系统',     icon:'🎓', activity:92, bots:412, desc:'查分/选课脚本',  trend:'up'    },
  { id:3, name:'体育场馆',     icon:'🏃', activity:65, bots:198, desc:'场馆预约脚本',   trend:'stable'},
  { id:4, name:'校园卡服务',   icon:'💳', activity:71, bots:267, desc:'充值/余额脚本',  trend:'up'    },
  { id:5, name:'宿舍网络',     icon:'🏠', activity:43, bots:127, desc:'代理节点',       trend:'down'  },
  { id:6, name:'食堂系统',     icon:'🍱', activity:38, bots: 98, desc:'余额查询脚本',   trend:'stable'},
  { id:7, name:'校园网认证',   icon:'🔐', activity:56, bots:189, desc:'爆破/撞库脚本',  trend:'stable'},
  { id:8, name:'学生服务中心', icon:'💼', activity:29, bots: 78, desc:'信息查询脚本',   trend:'down'  },
]

// ─── Live Event Generator ────────────────────────────────
const _eventTypes = [
  { type:'block',       label:'拦截', color:'#ff3b55' },
  { type:'detect',      label:'检测', color:'#ff6b35' },
  { type:'fingerprint', label:'指纹', color:'#00d4ff' },
]
const _mockUsernames = ['zhangsan','lisi','wangwu','zhaoliu','sunqi','zhouba']
const _targets  = [
  '/api/library/seat','/api/exam/score','/api/auth/login',
  '/api/sport/booking','/api/card/balance','/api/course/select',
]
const _rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

function hashUsernameForDisplay(rawUsername = '') {
  const source = String(rawUsername ?? '').trim()
  if (!source) return '匿名用户'
  if (/^U-[a-f0-9]{12}$/i.test(source)) return source

  // FNV-1a + 二次混合：前端仅用于稳定展示匿名标识，不用于安全存储。
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  const mixed = (hash >>> 0).toString(16).padStart(8, '0')
  const ext = Math.imul(hash ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  return `U-${mixed}${ext.toString(16).padStart(8, '0').slice(0, 4)}`
}

function createMockLiveLogs(limit = 14) {
  const size = Math.max(1, Math.min(Number(limit) || 14, 20))
  return Array.from({ length: size }, generateLiveEvent)
}

function createMockFingerprintScatterData(limit = 120) {
  const size = Math.max(10, Math.min(Number(limit) || 120, 300))
  return Array.from({ length: size }, (_, i) => {
    const suspiciousSignals = rndInt(0, 4)
    const riskScore = Number((suspiciousSignals + (Math.random() * 1.8)).toFixed(2))
    return {
      id: `mock_${Date.now()}_${i}`,
      riskScore,
      suspiciousSignals,
      verdict: suspiciousSignals >= 2 ? 'suspicious' : 'normal',
      time: new Date(Date.now() - i * 45_000).toLocaleTimeString('zh-CN', { hour12: false }),
    }
  })
}

export function generateLiveEvent() {
  const et = _rand(_eventTypes)
  return {
    id        : `${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    type      : et.type,
    label     : et.label,
    color     : et.color,
    username  : hashUsernameForDisplay(_rand(_mockUsernames)),
    target    : _rand(_targets),
    time      : new Date().toLocaleTimeString('zh-CN', { hour12:false }),
    confidence: Math.floor(Math.random() * 28) + 72,
  }
}

function buildApiUrl(path) {
  if (/^https?:\/\//.test(path)) return path
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path
}

async function requestJSON(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(buildApiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function onApiError(scope, err, fallbackFn) {
  if (USE_MOCK || FALLBACK_TO_MOCK) {
    console.warn(`[api:${scope}] 后端请求失败，已回退 Mock 数据:`, err)
    return fallbackFn()
  }
  throw err
}

function mockDefenseStats() {
  return {
    ...MOCK_DEFENSE_STATS,
    totalBlocked : MOCK_DEFENSE_STATS.totalBlocked  + rndInt(50, 200),
    todayBlocked : MOCK_DEFENSE_STATS.todayBlocked  + rndInt(1,  20),
    totalRequests: MOCK_DEFENSE_STATS.totalRequests + rndInt(200,800),
  }
}

function mockPurityData() {
  const botPct = parseFloat((5.7 + (Math.random() - 0.5) * 0.8).toFixed(1))
  const hourlyHistory = MOCK_PURITY_DATA.hourlyHistory.map(v => v + (Math.random()-0.5)*2 | 0)
  return {
    normalTrafficPct: parseFloat((100 - botPct).toFixed(1)),
    botTrafficPct   : botPct,
    purityScore     : Math.round(100 - botPct),
    trend           : 'improving',
    hourlyHistory,
    dailyBotHistory : build15DayBotHistory([], botPct, hourlyHistory),
  }
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num))
}

function toNumberArray(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(v => Number(v))
    .filter(v => Number.isFinite(v))
}

function build15DayBotHistory(rawDailyHistory = [], botTrafficPct = 0, rawHourlyHistory = []) {
  const daily = toNumberArray(rawDailyHistory)
  if (daily.length >= 15) {
    return daily.slice(-15).map(v => Number(v.toFixed(1)))
  }

  const hourlyPurity = toNumberArray(rawHourlyHistory)
  const sourceBot = (hourlyPurity.length ? hourlyPurity : MOCK_PURITY_DATA.hourlyHistory)
    .map(v => clamp(100 - v, 0, 100))

  const base = Number.isFinite(Number(botTrafficPct)) ? Number(botTrafficPct) : MOCK_PURITY_DATA.botTrafficPct
  const result = []

  for (let i = 0; i < 15; i += 1) {
    const fromHourly = sourceBot[i % sourceBot.length] ?? base
    const swing = ((i % 5) - 2) * 0.15
    const blended = (fromHourly * 0.65) + (base * 0.35) + swing
    result.push(Number(clamp(blended, 0.1, 99.9).toFixed(1)))
  }

  return result
}

function mockSpoofingData() {
  return MOCK_SPOOFING_DATA
}

function mockAttackLocations() {
  return MOCK_ATTACK_LOCATIONS.map(loc => ({
    ...loc,
    bots    : loc.bots + rndInt(-5, 15),
    activity: Math.min(99, Math.max(10, loc.activity + rndInt(-3, 3))),
  }))
}

function mockAgentResponse(question = '') {
  const normalized = String(question ?? '').toLowerCase()
  const dayMatch = normalized.match(/(\d+)\s*(天|日)/)
  const days = dayMatch ? clamp(Number(dayMatch[1]), 1, 30) : 10
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))

  const series = Array.from({ length: days }, (_, idx) => {
    const date = new Date(start)
    date.setDate(start.getDate() + idx)
    return {
      date: date.toISOString().slice(0, 10),
      botCount: rndInt(180, 430),
    }
  })

  const totalBotTraffic = series.reduce((acc, row) => acc + row.botCount, 0)
  const avgBotTraffic = Math.round(totalBotTraffic / series.length)

  return {
    intent: 'bot_traffic_by_days',
    data: {
      series,
      summary: {
        days,
        totalBotTraffic,
        avgBotTraffic,
      },
    },
    answer: `过去${days}天 Bot 流量总计约 ${totalBotTraffic}，日均约 ${avgBotTraffic}。如需我继续按天拆分或按风险等级统计，我可以继续查询。`,
    meta: {
      timeRange: {
        start: start.toISOString(),
        end: now.toISOString(),
      },
      source: 'mock-agent',
    },
  }
}

// ═══════════════════════════════════════════════
//  API STUBS  （后端就绪后替换 TODO 部分）
// ═══════════════════════════════════════════════

/**
 * 获取防御统计数据
 */
export async function fetchDefenseStats() {
  if (USE_MOCK) {
    await delay(280)
    return mockDefenseStats()
  }
  try {
    const data = await requestJSON('/api/v1/stats/defense')
    return {
      totalBlocked : Number(data.totalBlocked ?? 0),
      todayBlocked : Number(data.todayBlocked ?? 0),
      totalRequests: Number(data.totalRequests ?? 1),
      uptime       : data.uptime ?? '',
      activeDefense: Boolean(data.activeDefense),
    }
  } catch (err) {
    await delay(120)
    return onApiError('defense', err, mockDefenseStats)
  }
}

/**
 * 获取网络纯净度数据
 */
export async function fetchPurityData() {
  if (USE_MOCK) {
    await delay(200)
    const mockData = mockPurityData()
    return {
      ...mockData,
      dailyBotHistory: build15DayBotHistory(
        mockData.dailyBotHistory,
        mockData.botTrafficPct,
        mockData.hourlyHistory,
      ),
    }
  }
  try {
    const data = await requestJSON('/api/v1/stats/purity')
    const hourlyHistory = Array.isArray(data.hourlyHistory) ? data.hourlyHistory : []
    const botTrafficPct = Number(data.botTrafficPct ?? 0)
    return {
      normalTrafficPct: Number(data.normalTrafficPct ?? 0),
      botTrafficPct,
      purityScore     : Number(data.purityScore ?? 0),
      trend           : data.trend ?? 'stable',
      hourlyHistory,
      dailyBotHistory : build15DayBotHistory(data.dailyBotHistory, botTrafficPct, hourlyHistory),
    }
  } catch (err) {
    await delay(120)
    return onApiError('purity', err, mockPurityData)
  }
}

/**
 * 获取 Bot 伪装趋势数据
 */
export async function fetchSpoofingData() {
  if (USE_MOCK) {
    await delay(350)
    return mockSpoofingData()
  }
  try {
    const data = await requestJSON('/api/v1/stats/spoofing')
    if (!Array.isArray(data)) return []
    return data.map(row => ({
      name : String(row.name ?? '未知'),
      count: Number(row.count ?? 0),
      pct  : Number(row.pct ?? 0),
    }))
  } catch (err) {
    await delay(120)
    return onApiError('spoofing', err, mockSpoofingData)
  }
}

/**
 * 获取攻击热力位置数据
 */
export async function fetchAttackLocations() {
  if (USE_MOCK) {
    await delay(300)
    return mockAttackLocations()
  }
  try {
    const data = await requestJSON('/api/v1/stats/locations')
    if (!Array.isArray(data)) return []
    return data.map((loc, idx) => ({
      id      : Number(loc.id ?? idx + 1),
      name    : String(loc.name ?? '未知区域'),
      icon    : String(loc.icon ?? '📍'),
      activity: Number(loc.activity ?? 0),
      bots    : Number(loc.bots ?? 0),
      desc    : String(loc.desc ?? ''),
      trend   : String(loc.trend ?? 'stable'),
    }))
  } catch (err) {
    await delay(120)
    return onApiError('locations', err, mockAttackLocations)
  }
}

/**
 * 获取实时拦截日志（后端数据库）
 */
export async function fetchLiveInterceptLogs(limit = 14) {
  if (USE_MOCK) {
    await delay(220)
    return createMockLiveLogs(limit)
  }
  try {
    const data = await requestJSON(`/api/v1/logs/live?limit=${encodeURIComponent(limit)}`)
    if (!Array.isArray(data) || data.length === 0) {
      if (FALLBACK_TO_MOCK) return createMockLiveLogs(limit)
      return []
    }
    const logs = data.map((item, idx) => ({
      id        : String(item.id ?? `${Date.now()}_${idx}`),
      eventId   : String(item.eventId ?? item.event_id ?? ''),
      type      : String(item.type ?? 'detect'),
      label     : String(item.label ?? '检测'),
      // username  : hashUsernameForDisplay(item.username),
      username  : String(item.username ?? item.user_name ?? ''),
      userIp    : String(item.userIp ?? item.user_ip ?? ''),
      userAgent : String(item.userAgent ?? item.user_agent ?? ''),
      time      : String(item.time ?? ''),
      confidence: Number(item.confidence ?? 72),
    }))
    return logs.length > 0 ? logs : (FALLBACK_TO_MOCK ? createMockLiveLogs(limit) : [])
  } catch (err) {
    await delay(80)
    if (FALLBACK_TO_MOCK) {
      console.warn('[api:logs.live] 后端请求失败，已回退 Mock 日志数据:', err)
      return createMockLiveLogs(limit)
    }
    console.warn('[api:logs.live] 后端请求失败，返回空日志列表:', err)
    return []
  }
}

/**
 * 获取指纹日志散点分布（risk_score vs suspicious_signals）
 */
export async function fetchFingerprintScatterData(limit = 120) {
  if (USE_MOCK) {
    await delay(180)
    return createMockFingerprintScatterData(limit)
  }
  try {
    const data = await requestJSON(`/api/v1/logs/scatter?limit=${encodeURIComponent(limit)}`)
    if (!Array.isArray(data) || data.length === 0) {
      return FALLBACK_TO_MOCK ? createMockFingerprintScatterData(limit) : []
    }
    const points = data.map((item, idx) => ({
      id: String(item.id ?? `${Date.now()}_${idx}`),
      riskScore: Number(item.riskScore ?? item.risk_score ?? item.confidence ?? 0),
      suspiciousSignals: Number(item.suspiciousSignals ?? item.suspicious_signals ?? 0),
      verdict: String(item.verdict ?? 'normal'),
      time: String(item.time ?? ''),
    }))
    return points.length > 0 ? points : (FALLBACK_TO_MOCK ? createMockFingerprintScatterData(limit) : [])
  } catch (err) {
    await delay(80)
    if (FALLBACK_TO_MOCK) {
      console.warn('[api:logs.scatter] 后端请求失败，已回退 Mock 散点数据:', err)
      return createMockFingerprintScatterData(limit)
    }
    console.warn('[api:logs.scatter] 后端请求失败，返回空散点数据:', err)
    return []
  }
}

/**
 * Agent 查询（只读）
 */
export async function fetchDetectionResults({ page = 1, pageSize = 12, riskLevel = '', q = '' } = {}) {
  if (USE_MOCK) {
    await delay(160)
    return { page, pageSize, total: 0, items: [] }
  }

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  if (riskLevel) params.set('riskLevel', riskLevel)
  if (q) params.set('q', q)

  try {
    const data = await requestJSON(`/api/v1/detections?${params.toString()}`)
    const items = Array.isArray(data.items) ? data.items : []
    return {
      page: Number(data.page ?? page),
      pageSize: Number(data.pageSize ?? pageSize),
      total: Number(data.total ?? items.length),
      items: items.map((item) => ({
        id: Number(item.id),
        eventId: item.event_id ?? item.eventId ?? '',
        userName: String(item.user_name ?? item.userName ?? ''),
        userIp: String(item.user_ip ?? item.userIp ?? ''),
        userAgent: String(item.user_agent ?? item.userAgent ?? ''),
        eventDate: String(item.eventDate ?? ''),
        eventTime: String(item.eventTimeText ?? item.eventTime ?? ''),
        level1Score: Number(item.level1_score ?? 0),
        level2Score: Number(item.level2_score ?? 0),
        level3Score: Number(item.level3_score ?? 0),
        riskScore: Number(item.risk_score ?? 0),
        riskLevel: String(item.risk_level ?? ''),
        suggestedAction: String(item.suggested_action ?? ''),
        level1Reasons: String(item.level1_reasons ?? ''),
        level2Reasons: String(item.level2_reasons ?? ''),
        level3Reasons: String(item.level3_reasons ?? ''),
        allReasons: Array.isArray(item.all_reasons) ? item.all_reasons : [],
        ruleHits: Array.isArray(item.all_rule_hits) ? item.all_rule_hits : [],
      })),
    }
  } catch (err) {
    if (FALLBACK_TO_MOCK) {
      console.warn('[api:detections] backend request failed, returning empty list:', err)
      return { page, pageSize, total: 0, items: [] }
    }
    throw err
  }
}

export async function fetchTopRules(limit = 20) {
  if (USE_MOCK) {
    await delay(120)
    return []
  }

  try {
    const data = await requestJSON(`/api/v1/rules/top?limit=${encodeURIComponent(limit)}`)
    return Array.isArray(data)
      ? data.map((row) => ({
        level: Number(row.level ?? 0),
        ruleCode: String(row.ruleCode ?? row.rule_code ?? ''),
        ruleName: String(row.ruleName ?? row.rule_name ?? ''),
        hits: Number(row.hits ?? 0),
        avgWeight: Number(row.avgWeight ?? row.avg_weight ?? 0),
      }))
      : []
  } catch (err) {
    if (FALLBACK_TO_MOCK) {
      console.warn('[api:rules.top] backend request failed, returning empty list:', err)
      return []
    }
    throw err
  }
}

export async function queryAgent(question, context = {}) {
  if (USE_MOCK) {
    await delay(180)
    return mockAgentResponse(question)
  }

  try {
    return await requestJSON('/api/v1/agent/query', {
      method: 'POST',
      body: JSON.stringify({
        question: String(question ?? '').trim(),
        context,
      }),
    })
  } catch (err) {
    await delay(100)
    return onApiError('agent.query', err, () => mockAgentResponse(question))
  }
}

/**
 * 提交指纹数据进行服务端分析（可选）
 */
export async function analyzeFingerprint(fingerprintData) {
  if (USE_MOCK) {
    await delay(100)
    return null
  }
  try {
    return await requestJSON('/api/v1/fingerprint/analyze', {
      method: 'POST',
      body: JSON.stringify(fingerprintData),
    })
  } catch (err) {
    await delay(80)
    return onApiError('fingerprint.analyze', err, () => null)
  }
}

// ─── Utils ───────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
