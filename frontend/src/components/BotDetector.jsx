import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, CheckCircle, AlertCircle, XCircle, Loader, ShieldCheck, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import GlassCard from './GlassCard'
import { collectFullFingerprint } from '../utils/fingerprint'
import { analyzeFingerprint } from '../api'

// ─── 状态机 ───────────────────────────────────────────
const STATE = { IDLE: 'idle', SCANNING: 'scanning', DONE: 'done' }

// ─── 风险等级样式映射 ─────────────────────────────────
const levelStyle = {
  safe    : { badge: 'badge-safe',     icon: ShieldCheck,   iconClass: 'text-green-400' },
  warning : { badge: 'badge-warning',  icon: AlertCircle,   iconClass: 'text-yellow-400'},
  danger  : { badge: 'badge-danger',   icon: AlertCircle,   iconClass: 'text-orange-400'},
  critical: { badge: 'badge-critical', icon: XCircle,       iconClass: 'text-red-400'   },
}

// ─── 环形进度条 ───────────────────────────────────────
function RingProgress({ value, size = 80, stroke = 6, color = '#00ff88' }) {
  const r  = (size - stroke) / 2
  const c  = 2 * Math.PI * r
  const d  = c - (value / 100) * c
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeLinecap="round"
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: d }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  )
}

// ─── 扫描步骤列表 ─────────────────────────────────────
function ScanStepList({ steps }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-2.5"
        >
          {step.done ? (
            <CheckCircle size={14} className="text-green-400 shrink-0 step-check" />
          ) : step.active ? (
            <Loader size={14} className="text-cyan-400 shrink-0 animate-spin" />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
          )}
          <span className={`text-[12px] font-mono-custom ${step.done ? 'text-slate-300' : step.active ? 'text-cyan-300' : 'text-slate-600'}`}>
            {step.label}
          </span>
          {step.done && (
            <span className="text-[10px] text-green-400/70 ml-auto">完成</span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// ─── 脱敏 DeviceID 展示 ───────────────────────────────
function DeviceIdDisplay({ masked, revealed, onToggle }) {
  return (
    <div className="rounded-xl bg-black/30 border border-cyan-400/20 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-400 tracking-wider">设备指纹 ID（已脱敏）</span>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[11px] text-cyan-400/70 hover:text-cyan-400 transition-colors"
        >
          {revealed ? <EyeOff size={12}/> : <Eye size={12}/>}
          {revealed ? '隐藏' : '显示全部'}
        </button>
      </div>
      <div className="font-mono-custom text-sm tracking-[0.2em] text-cyan-300 text-glow-blue">
        DEV-{masked}
      </div>
      {revealed && (
        <p className="text-[10px] text-slate-500 mt-2">
          * 完整 ID 仅在本地显示；检测会提交匿名化特征用于服务端研判
        </p>
      )}
    </div>
  )
}

// ─── 详细信息折叠面板 ─────────────────────────────────
function DetailPanel({ result }) {
  const [open, setOpen] = useState(false)
  const l1 = result.level1 ?? {}
  const l2c = result.level2Canvas ?? {}
  const l2g = result.level2WebGL ?? {}
  const l3  = result.level3 ?? {}

  const rows = [
    { label: 'User-Agent',        value: l1.userAgent?.slice(0, 60) + '…' },
    { label: '平台',               value: l1.platform },
    { label: '语言',               value: l1.language },
    { label: '时区',               value: l1.timezone },
    { label: '屏幕分辨率',          value: `${l1.screenWidth}×${l1.screenHeight}` },
    { label: '像素密度',            value: `${l1.devicePixelRatio}x` },
    { label: 'Canvas 哈希',        value: l2c.canvasHash },
    { label: 'WebGL 渲染器',       value: l2g.webglRenderer?.slice(0, 50) },
    { label: 'WebGL 扩展数',       value: l2g.webglExtCount },
    { label: 'CPU 核心数',         value: l3.cpuCores },
    { label: 'WebDriver',          value: String(l3.webdriver) },
    { label: 'AudioContext',       value: l3.hasAudio ? '可用' : '不可用' },
    { label: '插件数量',            value: l3.pluginCount },
    { label: 'Function.toString',  value: l3.functionNative ? '原生' : '已修改' },
  ]

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-[12px] text-slate-300"
      >
        <span>查看详细指纹数据</span>
        {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-px bg-white/5 border-t border-white/5">
              {rows.map(r => (
                <div key={r.label} className="bg-[#0a0f1e] px-3 py-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">{r.label}</p>
                  <p className="text-[11px] text-slate-200 font-mono-custom truncate">{r.value ?? '—'}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────
export default function BotDetector() {
  const [phase, setPhase]       = useState(STATE.IDLE)
  const [steps, setSteps]       = useState([])
  const [progress, setProgress] = useState(0)
  const [result, setResult]     = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [serverVerdict, setServerVerdict] = useState(null)

  const startScan = useCallback(async () => {
    setPhase(STATE.SCANNING)
    setSteps([])
    setProgress(0)
    setResult(null)
    setRevealed(false)
    setServerVerdict(null)

    const data = await collectFullFingerprint(({ label, stepIndex, total, done }) => {
      setProgress(Math.round((stepIndex + (done ? 1 : 0)) / total * 100))
      setSteps(prev => {
        const next = [...prev]
        if (!done) {
          // mark previous as done
          if (next.length) next[next.length - 1] = { ...next[next.length - 1], active: false, done: true }
          next.push({ label, active: true, done: false })
        } else {
          if (next.length) next[next.length - 1] = { ...next[next.length - 1], active: false, done: true }
        }
        return next
      })
    })

    try {
      const serverResult = await analyzeFingerprint(data)
      if (serverResult?.verdict) {
        setServerVerdict(serverResult)
      }
    } catch {
      setServerVerdict(null)
    }

    setResult(data)
    setPhase(STATE.DONE)
  }, [])

  const ra = result?.riskAssessment
  const ls = ra ? (levelStyle[ra.level] ?? levelStyle.safe) : null
  const RiskIcon = ls?.icon

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-6 bg-warning-orange rounded-full glow-orange" />
        <div>
          <h2 className="text-base font-bold text-white">"我是机器人吗？"交互检测</h2>
          <p className="text-[11px] text-slate-500">浏览器指纹体检 · Level 1-3 全项检测</p>
        </div>
      </div>

      {/* ── IDLE 状态 ── */}
      {phase === STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-5 py-6"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/20 to-orange-500/20 border border-cyan-400/30 flex items-center justify-center">
              <Fingerprint size={40} className="text-cyan-400" />
            </div>
            {/* Ping rings */}
            <span className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ping-slow" />
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-300 mb-1">点击按钮，系统将对您的浏览器进行一次"体检"</p>
            <p className="text-[11px] text-slate-500">科普系统指纹识别原理 · 本地采集 + 服务端风险研判</p>
          </div>
          <button
            onClick={startScan}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500/80 to-blue-600/80 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm tracking-wide transition-all duration-200 shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:shadow-[0_0_28px_rgba(0,212,255,0.5)] active:scale-95"
          >
            🔍 开始浏览器检测
          </button>
        </motion.div>
      )}

      {/* ── SCANNING 状态 ── */}
      {phase === STATE.SCANNING && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
              <span>检测进度</span>
              <span className="text-cyan-400 font-mono-custom">{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Step list */}
          <ScanStepList steps={steps} />

          <p className="text-center text-[11px] text-slate-500">
            正在采集指纹特征，请稍候…
          </p>
        </motion.div>
      )}

      {/* ── DONE 状态 ── */}
      {phase === STATE.DONE && result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Score row */}
          <div className="flex items-center gap-4">
            {/* Risk ring */}
            <div className="relative flex items-center justify-center shrink-0">
              <RingProgress
                value={100 - (ra?.risk ?? 0)}
                size={78}
                stroke={6}
                color={ra?.color ?? '#00ff88'}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <RiskIcon size={22} className={ls?.iconClass} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${ls?.badge}`}>
                {ra?.label}
              </span>
              <div className="flex gap-4 mt-2.5">
                <div>
                  <p className="text-[10px] text-slate-500">风险评分</p>
                  <p className="text-lg font-bold font-mono-custom" style={{ color: ra?.color }}>
                    {ra?.risk}<span className="text-xs text-slate-500">/100</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">指纹唯一性</p>
                  <p className="text-lg font-bold font-mono-custom text-cyan-400">
                    {result.uniquenessScore}<span className="text-xs text-slate-500">/100</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Device ID */}
          <DeviceIdDisplay
            masked={result.maskedDeviceId ?? 'XXXX-****-****-XXXX'}
            revealed={revealed}
            onToggle={() => setRevealed(v => !v)}
          />

          {/* Risk reasons */}
          {ra?.reasons?.length > 0 && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-3.5">
              <p className="text-[11px] text-red-400 font-semibold mb-2">⚠ 检测到以下风险特征：</p>
              <ul className="space-y-1">
                {ra.reasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="text-red-400">·</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ra?.reasons?.length === 0 && (
            <div className="rounded-xl bg-green-400/5 border border-green-400/15 p-3.5 text-[12px] text-green-300">
              ✅ 未检测到自动化脚本特征，您的浏览器环境正常。
            </div>
          )}

          {serverVerdict?.verdict && (
            <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3.5 text-[12px] text-slate-300">
              服务端研判结果：
              <span className="ml-1 font-semibold text-cyan-300">{serverVerdict.verdict === 'suspicious' ? '可疑流量' : '正常流量'}</span>
              <span className="ml-2 text-slate-500">(signals: {serverVerdict.suspiciousSignals ?? 0})</span>
            </div>
          )}

          {/* Detailed data */}
          <DetailPanel result={result} />

          {/* Restart */}
          <button
            onClick={startScan}
            className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[12px] transition-colors"
          >
            重新检测
          </button>
        </motion.div>
      )}
    </GlassCard>
  )
}
