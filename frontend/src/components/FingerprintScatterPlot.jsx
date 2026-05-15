import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import GlassCard from './GlassCard'
import EChart from './EChart'
import { fetchFingerprintScatterData } from '../api'

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num))
}

function hashString(input = '') {
  const text = String(input)
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function stableJitter(seed, amplitude) {
  const unit = (hashString(seed) % 10_000) / 10_000
  return (unit - 0.5) * amplitude * 2
}

function buildOption(points) {
  const rawRiskScores = points
    .map((p) => Number(p.riskScore ?? p.confidence ?? 0))
    .filter((v) => Number.isFinite(v))
  const minRiskScore = rawRiskScores.length > 0 ? Math.min(...rawRiskScores) : 0
  const maxRiskScore = rawRiskScores.length > 0 ? Math.max(...rawRiskScores) : 5
  const riskPadding = Math.max(0.35, (maxRiskScore - minRiskScore) * 0.12)
  const axisMin = Math.max(0, Number((minRiskScore - riskPadding).toFixed(2)))
  const axisMax = Number((maxRiskScore + riskPadding).toFixed(2))

  const bucketCounter = new Map()
  points.forEach((p) => {
    const riskScore = Number(p.riskScore ?? p.confidence ?? 0)
    const suspiciousSignals = Number(p.suspiciousSignals ?? 0)
    const key = `${riskScore}_${suspiciousSignals}`
    bucketCounter.set(key, (bucketCounter.get(key) ?? 0) + 1)
  })

  const chartData = points.map((p) => {
    const rawRiskScore = Number(p.riskScore ?? p.confidence ?? 0)
    const rawSuspiciousSignals = Number(p.suspiciousSignals ?? 0)
    const bucketKey = `${rawRiskScore}_${rawSuspiciousSignals}`
    const bucketCount = Number(bucketCounter.get(bucketKey) ?? 1)

    const jitterX = stableJitter(`${p.id}_x`, 0.22)
    const jitterY = stableJitter(`${p.id}_y`, 0.22)
    const riskScore = clamp(rawRiskScore + jitterX, axisMin, axisMax)
    const suspiciousSignals = clamp(rawSuspiciousSignals + jitterY, -0.2, 5.2)

    // Cap visual impact so outlier values do not flood the canvas.
    const visualSignals = Math.max(0, Math.min(5, Number.isFinite(rawSuspiciousSignals) ? rawSuspiciousSignals : 0))
    const densityBoost = Math.min(6, Math.log2(bucketCount + 1) * 2.2)
    const size = Math.min(22, Math.max(6.5, 7 + visualSignals * 2.2 + densityBoost))
    const color = visualSignals >= 3
      ? '#ff6b6b'
      : visualSignals >= 2
        ? '#ffb36a'
        : '#40c9ff'

    return {
      value: [
        Number(riskScore.toFixed(2)),
        Number(suspiciousSignals.toFixed(2)),
        size,
        p.verdict ?? 'normal',
        p.time ?? '',
        rawRiskScore,
        rawSuspiciousSignals,
        bucketCount,
      ],
      itemStyle: {
        color,
        opacity: 0.72,
        borderColor: 'rgba(148,163,184,0.28)',
        borderWidth: 1,
      },
    }
  })

  return {
    backgroundColor: 'transparent',
    grid: { top: 20, right: 20, bottom: 40, left: 48 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(8, 17, 35, 0.96)',
      borderColor: 'rgba(64, 201, 255, 0.32)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (p) => {
        const [riskScore, suspiciousSignals, _size, verdict, time, rawRiskScore, rawSignals, bucketCount] = p.value
        return `<div style="font-family:monospace">
          <b style="color:#40c9ff">日志 #${p.dataIndex + 1}</b><br/>
          risk_score: <b>${Number(rawRiskScore).toFixed(2)}</b><br/>
          suspicious_signals: <b>${Number(rawSignals)}</b><br/>
          density bucket: <b>${Number(bucketCount)}</b><br/>
          verdict: <b>${verdict}</b><br/>
          time: <b>${time || '--:--:--'}</b><br/>
          plotted(x,y): <b>${Number(riskScore).toFixed(2)}, ${Number(suspiciousSignals).toFixed(2)}</b>
        </div>`
      },
    },
    xAxis: {
      type: 'value',
      name: 'risk_score',
      nameTextStyle: { color: '#64748b', fontSize: 11, padding: [8, 0, 0, 0] },
      min: axisMin,
      max: axisMax,
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.26)' } },
      axisLabel: { color: '#9fb1c8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
    },
    yAxis: {
      type: 'value',
      name: 'suspicious_signals',
      nameTextStyle: { color: '#64748b', fontSize: 11, padding: [0, 0, 8, 0] },
      min: -0.2,
      max: 5.2,
      interval: 1,
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.26)' } },
      axisLabel: { color: '#9fb1c8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
    },
    series: [{
      name: 'fingerprint_logs',
      type: 'scatter',
      data: chartData,
      symbolSize: (val) => Number(val[2] ?? 8),
      animationDuration: 500,
      animationEasing: 'cubicOut',
      blendMode: 'source-over',
      emphasis: {
        focus: 'series',
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(64,201,255,0.28)' },
      },
    }],
  }
}

export default function FingerprintScatterPlot() {
  const [points, setPoints] = useState([])

  useEffect(() => {
    let alive = true

    const load = async () => {
      const next = await fetchFingerprintScatterData(120)
      if (alive) setPoints(next)
    }

    load()
    const timer = setInterval(load, 10_000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const option = useMemo(() => buildOption(points), [points])

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 bg-emerald-400 rounded-full" style={{ boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
          <div>
            <h2 className="text-base font-bold text-white">指纹风险散点分布</h2>
            <p className="text-[11px] text-slate-500">fingerprint_logs: risk_score vs suspicious_signals</p>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
          <Activity size={12} className="text-cyan-400" />
          最近 120 条
        </span>
      </div>

      <EChart option={option} style={{ height: '300px' }} />

      <p className="text-[10px] text-slate-600 text-center">
        * 点越大表示 suspicious_signals 越高；红色点代表高风险日志
      </p>
    </GlassCard>
  )
}
