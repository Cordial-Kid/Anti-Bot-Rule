import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import GlassCard from './GlassCard'
import EChart from './EChart'
import { fetchSpoofingData, fetchTopRules } from '../api'

function buildOption(data) {
  const sorted = [...data].sort((a, b) => Number(b.pct ?? 0) - Number(a.pct ?? 0))
  const pieData = sorted.map((item) => ({
    name: item.name,
    value: Number(item.pct ?? 0),
  }))
  const colors = ['#00d4ff', '#00ff88', '#ff6b35', '#a78bfa', '#34d399', '#fb7185', '#60a5fa', '#fbbf24']

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10,14,26,0.95)',
      borderColor: 'rgba(0,212,255,0.25)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (p) => `<div style="font-family:monospace">
        <b style="color:#00d4ff">${p.name}</b><br/>
        占比: <b style="color:#ff6b35">${Number(p.value).toFixed(1)}%</b>
      </div>`,
    },
    color: colors,
    legend: {
      orient: 'vertical',
      right: 6,
      top: 'center',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#94a3b8', fontSize: 11 },
      formatter: (name) => {
        const found = pieData.find((item) => item.name === name)
        const pct = Number(found?.value ?? 0).toFixed(1)
        return `${name}  ${pct}%`
      },
    },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['35%', '50%'],
      data: pieData,
      minAngle: 3,
      padAngle: 1,
      avoidLabelOverlap: true,
      label: {
        show: true,
        color: '#cbd5e1',
        fontSize: 11,
        formatter: '{d}%',
      },
      emphasis: {
        scale: true,
        scaleSize: 6,
        itemStyle: { shadowBlur: 14, shadowColor: 'rgba(0,212,255,0.25)' },
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: 'rgba(8,13,26,0.95)',
      },
    }],
  }
}

function RuleCloud({ data }) {
  const sorted = [...data].sort((a, b) => b.pct - a.pct)
  const maxPct = sorted[0]?.pct ?? 1
  const colors = ['#00d4ff', '#00ff88', '#ff6b35', '#a78bfa', '#34d399', '#fb7185', '#60a5fa', '#fbbf24']

  return (
    <div className="flex flex-wrap gap-2 py-3">
      {sorted.map((item, index) => {
        const color = colors[index % colors.length]
        const size = Math.round(10 + (item.pct / maxPct) * 12)
        return (
          <motion.span
            key={item.name}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.04 }}
            className="cursor-default select-none rounded-full border px-2.5 py-1"
            style={{
              fontSize: `${size}px`,
              color,
              borderColor: `${color}30`,
              background: `${color}0f`,
            }}
            title={`${item.count.toLocaleString('zh-CN')} 次 / ${item.pct}%`}
          >
            {item.name}
          </motion.span>
        )
      })}
    </div>
  )
}

export default function BotSpoofingTrends() {
  const [data, setData] = useState([])
  const [rules, setRules] = useState([])
  const [viewMode, setViewMode] = useState('chart')

  useEffect(() => {
    let alive = true

    const load = async () => {
      const [nextData, nextRules] = await Promise.all([
        fetchSpoofingData(),
        fetchTopRules(8),
      ])
      if (alive) {
        setData(nextData)
        setRules(nextRules)
      }
    }

    load()
    const timer = setInterval(load, 10_000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const option = useMemo(() => (data.length ? buildOption(data) : null), [data])

  return (
    <GlassCard className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 rounded-full bg-purple-400 shadow-[0_0_12px_rgba(167,139,250,0.5)]" />
          <div>
            <h2 className="text-base font-bold text-white">高频规则命中</h2>
            <p className="text-[11px] text-slate-500">来自 bot_rule_hits，展示最常触发的反自动化规则</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
          {[
            ['chart', '图表'],
            ['cloud', '标签'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                viewMode === mode
                  ? 'border border-cyan-400/30 bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div>{option && <EChart option={option} style={{ height: '280px' }} />}</div>
      ) : (
        <RuleCloud data={data} />
      )}

      <div className="grid grid-cols-1 gap-3 border-t border-white/5 pt-1 sm:grid-cols-3">
        {rules.slice(0, 3).map((rule, index) => (
          <motion.div
            key={rule.ruleCode || rule.ruleName}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
          >
            <p className="text-[10px] text-slate-500">Level {rule.level}</p>
            <p className="mt-1 truncate text-[12px] font-semibold text-slate-200" title={rule.ruleName}>{rule.ruleName}</p>
            <p className="mt-2 font-mono-custom text-lg font-bold text-cyan-400">
              {rule.hits.toLocaleString('zh-CN')}<span className="ml-1 text-xs text-slate-500">hits</span>
            </p>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-[10px] text-slate-600">
        * 当前面板已经从旧 UA 伪装 mock 数据切换为真实规则命中统计。
      </p>
    </GlassCard>
  )
}
