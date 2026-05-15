import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import GlassCard from './GlassCard'
import EChart from './EChart'
import { fetchPurityData } from '../api'

// ─── Purity 等级描述 ──────────────────────────────────
function getPurityLevel(score) {
  if (score >= 95) return { label: '优秀', color: '#00ff88', badge: 'safe'    }
  if (score >= 88) return { label: '良好', color: '#00d4ff', badge: 'safe'    }
  if (score >= 75) return { label: '一般', color: '#ffcc00', badge: 'warning' }
  if (score >= 60) return { label: '较差', color: '#ff6b35', badge: 'danger'  }
  return                   { label: '危险', color: '#ff3b55', badge: 'critical'}
}

// ─── ECharts 仪表盘配置 ────────────────────────────────
function buildGaugeOption(score) {
  const level = getPurityLevel(score)
  return {
    backgroundColor: 'transparent',
    series: [{
      type        : 'gauge',
      startAngle  : 210,
      endAngle    : -30,
      center      : ['50%', '58%'],
      radius      : '88%',
      min: 0, max: 100,
      splitNumber : 5,
      axisLine: {
        lineStyle: {
          width: 18,
          color: [
            [0.30, 'rgba(255,59,85,0.9)'],
            [0.50, 'rgba(255,107,53,0.9)'],
            [0.70, 'rgba(255,204,0,0.9)'],
            [0.88, 'rgba(0,212,255,0.9)'],
            [1.00, 'rgba(0,255,136,0.9)'],
          ],
        },
      },
      pointer: {
        icon  : 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '55%',
        width : 14,
        offsetCenter: [0, '-55%'],
        itemStyle: { color: 'auto' },
      },
      axisTick  : { length: 10, lineStyle: { color: 'rgba(255,255,255,0.25)', width: 1.5 } },
      splitLine : { length: 20, lineStyle: { color: 'rgba(255,255,255,0.3)',  width: 3   } },
      axisLabel : {
        color    : '#64748b',
        fontSize : 11,
        distance : -40,
        formatter: v => (v % 25 === 0 ? v : ''),
      },
      title: {
        offsetCenter: [0, '28%'],
        fontSize    : 13,
        color       : '#64748b',
        fontWeight  : 'normal',
      },
      detail: {
        valueAnimation: true,
        offsetCenter  : [0, '-2%'],
        fontSize      : 52,
        fontWeight    : 'bold',
        fontFamily    : "'JetBrains Mono', Consolas, monospace",
        color         : level.color,
        formatter     : v => `${v}`,
      },
      data: [{ value: score, name: '网络纯净度' }],
    }],
  }
}

function buildBotTrendOption(labels, values) {
  const maxValue = Math.max(10, Math.ceil((Math.max(...values, 0) + 1) / 2) * 2)
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(10,14,26,0.95)',
      borderColor: 'rgba(255,107,53,0.35)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params) => {
        const p = params[0]
        return `<div style="font-family:monospace">
          <b style="color:#fb7185">${p.axisValue}</b><br/>
          Bot 流量：<b style="color:#ff6b35">${Number(p.data).toFixed(1)}%</b>
        </div>`
      },
    },
    grid: { top: 20, right: 12, bottom: 34, left: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        interval: (idx) => idx % 2 === 0,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: maxValue,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: '{value}%',
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    series: [{
      name: 'Bot流量',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data: values,
      lineStyle: { width: 2.5, color: '#fb7185' },
      itemStyle: { color: '#fb7185', borderColor: '#fff', borderWidth: 1 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(251,113,133,0.35)' },
            { offset: 1, color: 'rgba(251,113,133,0.02)' },
          ],
        },
      },
    }],
  }
}

// ─── 趋势图标 ─────────────────────────────────────────
function TrendIcon({ trend }) {
  if (trend === 'improving') return <TrendingUp   size={14} className="text-green-400" />
  if (trend === 'degrading') return <TrendingDown size={14} className="text-red-400"   />
  return                             <Minus        size={14} className="text-slate-400" />
}

function getRecent15DayLabels() {
  const labels = []
  const now = new Date()
  for (let i = 14; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    labels.push(`${mm}-${dd}`)
  }
  return labels
}

// ─── 主组件 ────────────────────────────────────────────
export default function NetworkPurityIndex() {
  const [data, setData] = useState({
    purityScore     : 94,
    normalTrafficPct: 94.3,
    botTrafficPct   : 5.7,
    trend           : 'improving',
    hourlyHistory   : [97,96,95,93,91,93,95,96,97,95,94,94],
    dailyBotHistory : [4.2,4.5,4.8,5.0,5.1,5.4,5.8,5.5,5.2,5.0,5.3,5.6,5.8,5.9,5.7],
  })

  useEffect(() => {
    fetchPurityData().then(setData)
    const t = setInterval(() => fetchPurityData().then(setData), 8000)
    return () => clearInterval(t)
  }, [])

  const level  = getPurityLevel(data.purityScore)
  const option = useMemo(() => buildGaugeOption(data.purityScore), [data.purityScore])
  const trendOption = useMemo(() => {
    const labels = getRecent15DayLabels()
    const values = Array.isArray(data.dailyBotHistory) ? data.dailyBotHistory.slice(-15) : []
    const padded = values.length >= 15
      ? values
      : Array.from({ length: 15 }, (_, idx) => {
        const v = values[idx] ?? data.botTrafficPct
        return Number(v)
      })
    return buildBotTrendOption(labels, padded)
  }, [data.dailyBotHistory, data.botTrafficPct])

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 bg-aurora-green rounded-full glow-green" />
          <div>
            <h2 className="text-base font-bold text-white">网络"纯净度"仪表盘</h2>
            <p className="text-[11px] text-slate-500">类空气质量指数 · 实时更新</p>
          </div>
        </div>
        <span className={`text-[11px] font-bold px-3 py-1 rounded-full badge-${level.badge}`}>
          {level.label}
        </span>
      </div>

      {/* Gauge */}
      <div className="relative">
        <EChart option={option} style={{ height: '230px' }} />
        {/* Overlay trend & update hint */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            <Activity size={10} className="text-slate-400" />
            <span className="text-[10px] text-slate-400">每 8s 刷新</span>
            <TrendIcon trend={data.trend} />
          </div>
        </div>
      </div>

      {/* Traffic split bars */}
      <div className="space-y-3">
        {/* Normal */}
        <div>
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-aurora-green inline-block" />
              正常流量
            </span>
            <span className="font-semibold text-aurora-green font-mono-custom">
              {data.normalTrafficPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-green-400/80 to-cyan-400/80"
              initial={{ width: 0 }}
              animate={{ width: `${data.normalTrafficPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Bot */}
        <div>
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />
              Bot 流量
            </span>
            <span className="font-semibold text-red-400 font-mono-custom">
              {data.botTrafficPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-red-500/80 to-orange-500/80"
              initial={{ width: 0 }}
              animate={{ width: `${data.botTrafficPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* 15 day bot traffic trend */}
      <div className="pt-1 border-t border-white/5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-500">过去 15 天 Bot 流量趋势</p>
          <p className="text-[10px] text-slate-500">单位：百分比（%）</p>
        </div>
        <EChart option={trendOption} style={{ height: '190px' }} />
      </div>
    </GlassCard>
  )
}
