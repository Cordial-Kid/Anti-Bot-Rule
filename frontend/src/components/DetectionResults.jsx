import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ListFilter, Search, ShieldAlert } from 'lucide-react'
import GlassCard from './GlassCard'
import { fetchDetectionResults } from '../api'

const riskMeta = {
  low: { label: 'Low', className: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25', icon: CheckCircle2 },
  suspicious: { label: 'Suspicious', className: 'text-amber-300 bg-amber-400/10 border-amber-400/25', icon: AlertTriangle },
  medium_high: { label: 'Medium High', className: 'text-orange-300 bg-orange-400/10 border-orange-400/25', icon: ShieldAlert },
  high: { label: 'High', className: 'text-red-300 bg-red-400/10 border-red-400/25', icon: ShieldAlert },
}

function RiskBadge({ level }) {
  const meta = riskMeta[level] ?? riskMeta.low
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

function ScoreCell({ value }) {
  const score = Number(value ?? 0)
  const color = score >= 65 ? 'text-red-300' : score >= 45 ? 'text-orange-300' : score >= 25 ? 'text-amber-300' : 'text-cyan-300'
  return <span className={`font-mono-custom font-semibold ${color}`}>{score.toFixed(2)}</span>
}

function RuleSummary({ hits }) {
  const names = Array.isArray(hits)
    ? hits.slice(0, 3).map((hit) => hit.rule_name || hit.ruleName || hit.rule_code || hit.ruleCode).filter(Boolean)
    : []

  if (!names.length) {
    return <span className="text-slate-600">No clear rule hit</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="max-w-[180px] truncate rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-300" title={name}>
          {name}
        </span>
      ))}
    </div>
  )
}

export default function DetectionResults() {
  const [riskLevel, setRiskLevel] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchDetectionResults({ page, pageSize: 12, riskLevel, q })
      .then((next) => {
        if (alive) setData(next)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [page, riskLevel, q])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(Number(data.total ?? 0) / 12)), [data.total])

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-1 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.55)]" />
          <div>
            <h2 className="text-base font-bold text-white">Detection Results</h2>
            <p className="text-[11px] text-slate-500">MySQL: bot_detection_results / bot_rule_hits</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-slate-400">
            <Search size={13} />
            <input
              value={q}
              onChange={(event) => {
                setPage(1)
                setQ(event.target.value)
              }}
              placeholder="Search user/IP/UA/event ID"
              className="w-44 bg-transparent text-slate-200 outline-none placeholder:text-slate-600"
            />
          </label>

          <label className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-slate-400">
            <ListFilter size={13} />
            <select
              value={riskLevel}
              onChange={(event) => {
                setPage(1)
                setRiskLevel(event.target.value)
              }}
              className="bg-[#0b1220] text-slate-200 outline-none"
            >
              <option value="">All risks</option>
              <option value="low">Low</option>
              <option value="suspicious">Suspicious</option>
              <option value="medium_high">Medium High</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1160px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">User / IP</th>
              <th className="py-2 pr-3">User-Agent</th>
              <th className="py-2 pr-3">Level Scores</th>
              <th className="py-2 pr-3">Risk</th>
              <th className="py-2 pr-3">Level</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Rule Hits</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.id} className="border-b border-white/[0.05] text-slate-300 hover:bg-white/[0.025]">
                <td className="py-3 pr-3 font-mono-custom text-slate-400">
                  <div>{row.eventDate || '--'}</div>
                  <div className="text-[10px] text-slate-600">{row.eventTime || '--:--:--'}</div>
                </td>
                <td className="py-3 pr-3">
                  <div className="max-w-[150px] truncate text-slate-200" title={row.userName}>{row.userName || 'anonymous'}</div>
                  <div className="font-mono-custom text-[10px] text-slate-500">{row.userIp || 'unknown ip'}</div>
                </td>
                <td className="py-3 pr-3">
                  <div className="max-w-[280px] truncate font-mono-custom text-[10px] text-slate-400" title={row.userAgent || 'unknown user-agent'}>
                    {row.userAgent || 'unknown user-agent'}
                  </div>
                </td>
                <td className="py-3 pr-3 font-mono-custom text-[11px]">
                  <span className="text-slate-500">L1</span> <ScoreCell value={row.level1Score} />
                  <span className="ml-2 text-slate-500">L2</span> <ScoreCell value={row.level2Score} />
                  <span className="ml-2 text-slate-500">L3</span> <ScoreCell value={row.level3Score} />
                </td>
                <td className="py-3 pr-3 text-sm">
                  <ScoreCell value={row.riskScore} />
                </td>
                <td className="py-3 pr-3">
                  <RiskBadge level={row.riskLevel} />
                </td>
                <td className="py-3 pr-3">
                  <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono-custom text-[11px] text-slate-300">
                    {row.suggestedAction || 'allow'}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <RuleSummary hits={row.ruleHits} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && data.items.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-500">No detection results yet. Run main.py to write MySQL results.</div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-slate-500">
        <span>{loading ? 'Loading...' : `${Number(data.total ?? 0).toLocaleString('zh-CN')} records`}</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded border border-white/10 px-2.5 py-1 text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Previous
          </button>
          <span className="font-mono-custom">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            className="rounded border border-white/10 px-2.5 py-1 text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Next
          </button>
        </div>
      </div>
    </GlassCard>
  )
}
