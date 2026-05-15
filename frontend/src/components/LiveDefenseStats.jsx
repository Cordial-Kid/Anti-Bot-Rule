import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Zap, TrendingUp, Activity } from 'lucide-react'
import GlassCard from './GlassCard'
import { fetchDefenseStats } from '../api'

const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_ORIGIN || '').replace(/\/$/, '')

function buildApiUrl(path) {
  return BACKEND_ORIGIN ? `${BACKEND_ORIGIN}${path}` : path
}

async function fetchRawLiveInterceptLogs(limit = 14) {
  const response = await fetch(buildApiUrl(`/api/v1/logs/live?limit=${encodeURIComponent(limit)}`))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data)) return []

  return data.map((item, index) => ({
    id: String(item.id ?? `${Date.now()}_${index}`),
    eventId: String(item.eventId ?? item.event_id ?? ''),
    type: String(item.type ?? 'detect'),
    label: String(item.label ?? 'detect'),
    username: String(item.username ?? item.user_name ?? ''),
    userIp: String(item.userIp ?? item.user_ip ?? ''),
    userAgent: String(item.userAgent ?? item.user_agent ?? ''),
    time: String(item.time ?? ''),
    confidence: Number(item.confidence ?? 0),
  }))
}

function AnimatedNumber({ value, duration = 1800 }) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef(null)
  const prevRef = useRef(value)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const from = prevRef.current
    const to = value
    const start = performance.now()

    const step = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const e = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * e))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else prevRef.current = to
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return display.toLocaleString('zh-CN')
}

function StatCard({ Icon, label, value, sub, accentClass, borderClass, glowClass, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-2xl bg-[rgba(13,20,40,0.82)] backdrop-blur-xl border p-6 ${borderClass}`}
    >
      <div className={`absolute inset-0 opacity-[0.04] ${glowClass}`} />
      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30" />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${accentClass} bg-opacity-10`}>
            <Icon size={18} />
          </div>
          <span className={`text-[10px] font-bold tracking-[0.15em] px-2 py-1 rounded-full ${accentClass} bg-opacity-10 border border-current border-opacity-30`}>
            LIVE
          </span>
        </div>

        <div className={`text-[2.6rem] font-bold font-mono-custom tabular-nums leading-none ${accentClass}`}>
          <AnimatedNumber value={value} />
        </div>

        <div>
          <p className="text-sm text-slate-200 font-semibold">{label}</p>
          {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
    </motion.div>
  )
}

const typeStyle = {
  block: 'text-red-400 bg-red-500/10 border-red-500/30',
  detect: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  fingerprint: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/25',
}

function EventRow({ event }) {
  const detail = [
    event.eventId ? `event ${event.eventId}` : '',
    event.userIp || '',
    event.userAgent || '',
  ].filter(Boolean).join(' | ')

  return (
    <motion.div
      key={event.id}
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.28 }}
      className="flex items-center gap-3 py-[7px] border-b border-white/[0.04] last:border-0"
    >
      <span className="text-[11px] text-slate-500 font-mono-custom w-[68px] shrink-0">
        {event.time}
      </span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${typeStyle[event.type] ?? typeStyle.detect}`}>
        {event.label}
      </span>
      <span className="min-w-0 flex-1 font-mono-custom">
        <span className="block truncate text-[11px] text-slate-200" title={event.username || 'unknown user'}>
          {event.username || 'unknown user'}
        </span>
        {detail && (
          <span className="block truncate text-[10px] text-slate-500" title={detail}>
            {detail}
          </span>
        )}
      </span>
      <span className="text-[11px] text-slate-500 shrink-0">
        risk <span className="text-cyan-400 font-semibold">{event.confidence}%</span>
      </span>
    </motion.div>
  )
}

export default function LiveDefenseStats() {
  const [stats, setStats] = useState({
    totalBlocked: 0,
    todayBlocked: 0,
    totalRequests: 0,
  })
  const [events, setEvents] = useState([])

  useEffect(() => {
    const loadEvents = () => {
      fetchRawLiveInterceptLogs(14)
        .then(setEvents)
        .catch((error) => {
          console.warn('[live-log] failed to load live events:', error)
          setEvents([])
        })
    }

    fetchDefenseStats().then(setStats)
    loadEvents()
    const statsTimer = setInterval(() => fetchDefenseStats().then(setStats), 5000)
    const eventTimer = setInterval(loadEvents, 1400)
    return () => {
      clearInterval(statsTimer)
      clearInterval(eventTimer)
    }
  }, [])

  const safeTotalRequests = Math.max(Number(stats.totalRequests ?? 0), 1)
  const interceptRate = ((Number(stats.totalBlocked ?? 0) / safeTotalRequests) * 100).toFixed(2)

  return (
    <section>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3 mb-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-6 bg-cyan-400 rounded-full glow-blue" />
          <h2 className="text-xl font-bold text-white">Real-Time Defense</h2>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" />
          <span className="text-[10px] font-bold text-red-400 tracking-[0.15em]">LIVE</span>
        </div>
        <span className="text-sm text-slate-500">Polling backend every 1.4s for latest detection records</span>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <StatCard
          Icon={Shield}
          label="Total blocked or challenged"
          value={Number(stats.totalBlocked ?? 0)}
          sub="Derived from result risk level and suggested action"
          accentClass="text-red-400"
          borderClass="border-red-500/15"
          glowClass="bg-red-500"
          delay={0}
        />
        <StatCard
          Icon={Zap}
          label="Blocked today"
          value={Number(stats.todayBlocked ?? 0)}
          sub={`Today ${new Date().toLocaleDateString('zh-CN')}`}
          accentClass="text-warning-orange"
          borderClass="border-orange-500/15"
          glowClass="bg-orange-500"
          delay={0.08}
        />
        <StatCard
          Icon={TrendingUp}
          label="Total processed requests"
          value={Number(stats.totalRequests ?? 0)}
          sub={`Block/challenge rate ${interceptRate}%`}
          accentClass="text-aurora-green"
          borderClass="border-green-400/15"
          glowClass="bg-green-400"
          delay={0.16}
        />
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-cyan-400" />
            <span className="text-sm font-semibold text-white">Live Intercept Log</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
            <span className="text-[11px] text-green-400 font-mono-custom">raw identity visible</span>
          </div>
        </div>

        <div className="overflow-hidden max-h-72">
          <AnimatePresence initial={false}>
            {events.map((event) => <EventRow key={event.id} event={event} />)}
          </AnimatePresence>
        </div>
      </GlassCard>
    </section>
  )
}
