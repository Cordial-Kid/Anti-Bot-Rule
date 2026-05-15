import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Wifi, AlertTriangle, Radio } from 'lucide-react'

export default function Header() {
  const [time, setTime] = useState(new Date())
  const [waveHeights, setWaveHeights] = useState([3, 5, 7, 5, 4, 6, 3])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      setWaveHeights(prev => prev.map(h => Math.max(2, Math.min(9, h + (Math.random() * 2 - 1) | 0)))      )
    }, 600)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="relative overflow-hidden bg-[#060b16] border-b border-white/5">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />

      {/* Scanline animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent"
          animate={{ top: ['-2px', 'calc(100% + 2px)'] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">

          {/* ── Logo & Title ── */}
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/25 to-blue-700/25 border border-cyan-400/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              {/* Live dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 live-indicator" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-[0.12em] text-white">
                CAMPUS <span className="text-cyan-400 text-glow-blue">ANTI-BOT</span> SYSTEM
              </h1>
              <p className="text-[11px] text-slate-500 tracking-widest mt-0.5">
                校园网智能防御系统 · 公开数据看板
              </p>
            </div>
          </div>

          {/* ── Status Badges ── */}
          <div className="hidden md:flex items-center gap-3">
            {/* Online */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-400/8 border border-green-400/25">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
              <span className="text-[11px] font-semibold text-green-400 tracking-widest">系统在线</span>
            </div>

            {/* Alert */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/8 border border-orange-500/25">
              <AlertTriangle className="w-3 h-3 text-orange-400" />
              <span className="text-[11px] font-semibold text-orange-400">今日预警 47</span>
            </div>

            {/* Radio / broadcasting */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400/8 border border-cyan-400/20">
              <Radio className="w-3 h-3 text-cyan-400" />
              <span className="text-[11px] text-cyan-400">实时监控中</span>
            </div>
          </div>

          {/* ── Network waveform + Time ── */}
          <div className="flex items-center gap-5 shrink-0">
            <div className="hidden sm:flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-cyan-400/70 mr-1" />
              {waveHeights.map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-cyan-400 rounded-sm"
                  animate={{ height: `${h * 3}px` }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                />
              ))}
            </div>

            <div className="text-right">
              <div className="text-sm font-mono-custom text-cyan-400 tabular-nums leading-none">
                {time.toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {time.toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
