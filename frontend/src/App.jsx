import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Header from './components/Header'
import LiveDefenseStats from './components/LiveDefenseStats'
import NetworkPurityIndex from './components/NetworkPurityIndex'
import BotDetector from './components/BotDetector'
import BotSpoofingTrends from './components/BotSpoofingTrends'
import DetectionResults from './components/DetectionResults'
import AgentChatWidget from './components/AgentChatWidget'
import Footer from './components/Footer'
import { fetchDefenseStats } from './api'

// ─── 区块分隔线 ───────────────────────────────────────
function Divider() {
  return (
    <div className="section-sep" />
  )
}

// ─── 英雄横幅 ─────────────────────────────────────────
function extractUptimeDays(uptime) {
  const text = String(uptime ?? '')
  const match = text.match(/(\d+)\s*天/)
  return match ? match[1] : '127'
}

function HeroBanner({ uptimeDays }) {
  return (
    <div className="relative overflow-hidden py-14 px-6 border-b border-white/5 scanline-wrap">
      {/* BG glow blobs */}
      <div className="absolute -top-32 left-1/4  w-96 h-96 rounded-full bg-cyan-500/8   blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 w-72 h-72 rounded-full bg-purple-500/8 blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y:   0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-400/8 border border-cyan-400/20 text-[11px] text-cyan-400 tracking-widest mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
            REAL-TIME DEFENSE · 实时防御
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y:  0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4"
        >
          <span className="gradient-text">校园网 Anti-Bot</span>
          <br className="sm:hidden" />
          <span className="text-white"> 防御系统</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-slate-400 text-base max-w-xl mx-auto leading-relaxed"
        >
          通过 Canvas、WebGL、Level 1-3 高级指纹技术与 LLM 行为分析，
          精准识别脚本机器人，保护校园网络安全与公平。
        </motion.p>

        {/* Key metrics row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex flex-wrap justify-center gap-8 mt-8"
        >
          {[
            { label: '指纹维度',   value: '15+',  unit: '项' },
            { label: '检测准确率', value: '99.2', unit: '%'  },
            { label: '响应延迟',   value: '<5',   unit: 'ms' },
            { label: '系统运行',   value: uptimeDays,  unit: '天' },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className="text-2xl font-bold font-mono-custom text-cyan-400">
                {m.value}<span className="text-base text-slate-500 ml-0.5">{m.unit}</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ─── App 主体 ─────────────────────────────────────────
export default function App() {
  const [uptimeDays, setUptimeDays] = useState('127')

  useEffect(() => {
    let alive = true

    const load = async () => {
      const data = await fetchDefenseStats()
      if (alive) setUptimeDays(extractUptimeDays(data?.uptime))
    }

    load()
    const timer = setInterval(load, 30_000)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#080d1a] bg-grid text-white">
      {/* Top navigation */}
      <Header />

      {/* Hero */}
      <HeroBanner uptimeDays={uptimeDays} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Section 1 — Live Defense Stats */}
        <LiveDefenseStats />

        <DetectionResults />

        <Divider />

        {/* Section 2 — Purity + Bot Detector */}
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <NetworkPurityIndex />
            <BotDetector />
          </div>
        </div>

        <Divider />

        {/* Section 3 — Bot Spoofing Trends */}
        <BotSpoofingTrends />
      </main>

      <AgentChatWidget />
      <Footer />
    </div>
  )
}
