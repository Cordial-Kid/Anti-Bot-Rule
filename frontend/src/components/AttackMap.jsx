import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import GlassCard from './GlassCard'
import { fetchAttackLocations } from '../api'

// ─── Heat 颜色 ─────────────────────────────────────────
function heatColor(activity) {
  if (activity >= 85) return { bar: 'bg-red-500',    text: 'text-red-400',    dot: 'bg-red-500',    ring: 'rgba(255,59,85,0.3)'  }
  if (activity >= 65) return { bar: 'bg-orange-500', text: 'text-orange-400', dot: 'bg-orange-400', ring: 'rgba(255,107,53,0.3)' }
  if (activity >= 45) return { bar: 'bg-yellow-500', text: 'text-yellow-300', dot: 'bg-yellow-400', ring: 'rgba(255,204,0,0.3)'  }
  return                     { bar: 'bg-cyan-500',   text: 'text-cyan-400',   dot: 'bg-cyan-400',   ring: 'rgba(0,212,255,0.3)'  }
}

// ─── 趋势图标 ─────────────────────────────────────────
function Trend({ t }) {
  if (t === 'up')   return <TrendingUp   size={12} className="text-red-400"   />
  if (t === 'down') return <TrendingDown size={12} className="text-green-400" />
  return                   <Minus        size={12} className="text-slate-500" />
}

// ─── 单个位置行 ───────────────────────────────────────
function LocationRow({ loc, delay }) {
  const hc = heatColor(loc.activity)

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x:   0 }}
      transition={{ delay, duration: 0.4 }}
      className="group flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-1 -mx-1 transition-colors"
    >
      {/* Icon with activity dot */}
      <div className="relative shrink-0">
        <span className="text-xl">{loc.icon}</span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${hc.dot} pulse-dot`}
          style={{ animationDelay: `${delay * 0.5}s` }}
        />
      </div>

      {/* Name & desc */}
      <div className="min-w-0 w-28 shrink-0">
        <p className="text-[13px] font-semibold text-slate-200 truncate">{loc.name}</p>
        <p className="text-[10px] text-slate-500 truncate">{loc.desc}</p>
      </div>

      {/* Heat bar */}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${hc.bar} opacity-80`}
            initial={{ width: 0 }}
            animate={{ width: `${loc.activity}%` }}
            transition={{ duration: 0.9, delay: delay + 0.1, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className={`text-[12px] font-bold font-mono-custom ${hc.text} w-9 text-right`}>
          {loc.activity}%
        </span>
        <div className="flex items-center gap-1 w-16 justify-end">
          <AlertTriangle size={10} className="text-slate-600" />
          <span className="text-[11px] text-slate-500 font-mono-custom">{loc.bots}</span>
          <Trend t={loc.trend} />
        </div>
      </div>
    </motion.div>
  )
}

// ─── 热力图网格（仅大屏显示）─────────────────────────
function HeatGrid({ data }) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {data.map((loc, i) => {
        const hc = heatColor(loc.activity)
        return (
          <motion.div
            key={loc.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border border-white/[0.06] cursor-default"
            style={{
              background: `radial-gradient(circle at 50% 120%, ${hc.ring} 0%, rgba(10,14,26,0.9) 70%)`,
            }}
            title={`${loc.name}：${loc.bots} 次 Bot 活动`}
          >
            <span className="text-xl">{loc.icon}</span>
            <p className="text-[9px] text-slate-400 text-center leading-tight px-0.5">{loc.name}</p>
            <p className={`text-[11px] font-bold font-mono-custom ${hc.text}`}>{loc.activity}%</p>

            {/* Intensity pulse for high-activity */}
            {loc.activity >= 75 && (
              <span
                className={`absolute inset-0 rounded-xl border ${loc.activity >= 85 ? 'border-red-500/30' : 'border-orange-500/20'} animate-ping-slow`}
                style={{ animationDuration: `${1.5 + (100 - loc.activity) * 0.03}s` }}
              />
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────
export default function AttackMap() {
  const [locations, setLocations] = useState([])
  const [view, setView] = useState('list') // 'list' | 'grid'

  useEffect(() => {
    fetchAttackLocations().then(setLocations)
    const t = setInterval(() => fetchAttackLocations().then(setLocations), 10_000)
    return () => clearInterval(t)
  }, [])

  // Sort by activity descending
  const sorted = [...locations].sort((a, b) => b.activity - a.activity)
  const topBot = sorted[0]

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 bg-red-400 rounded-full" style={{ boxShadow: '0 0 12px rgba(255,59,85,0.5)' }} />
          <div>
            <h2 className="text-base font-bold text-white">校园 Bot 活动热力图</h2>
            <p className="text-[11px] text-slate-500">各区域脚本攻击频率 · 每 10s 刷新</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
          {['list', 'grid'].map(m => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                view === m
                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'list' ? '≡ 列表' : '⊞ 热图'}
            </button>
          ))}
        </div>
      </div>

      {/* Top alert banner */}
      {topBot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20"
        >
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-[12px] text-slate-300">
            当前活动最高：
            <span className="text-red-300 font-semibold mx-1">{topBot.name}</span>
            — {topBot.desc}，活跃度
            <span className="text-red-400 font-bold font-mono-custom ml-1">{topBot.activity}%</span>
          </p>
        </motion.div>
      )}

      {/* Content */}
      {view === 'grid' ? (
        <HeatGrid data={sorted} />
      ) : (
        <div className="overflow-hidden">
          {sorted.map((loc, i) => (
            <LocationRow key={loc.id} loc={loc} delay={i * 0.05} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-white/5">
        <span className="text-[10px] text-slate-600">活跃度图例：</span>
        {[
          { label: '极高 ≥85%', cls: 'bg-red-500'   },
          { label: '高 65-84%', cls: 'bg-orange-500' },
          { label: '中 45-64%', cls: 'bg-yellow-500' },
          { label: '低 <45%',   cls: 'bg-cyan-500'   },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${l.cls} opacity-70`} />
            <span className="text-[10px] text-slate-500">{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-slate-600">⬆ 上升 ─ 稳定 ⬇ 下降</span>
      </div>
    </GlassCard>
  )
}
