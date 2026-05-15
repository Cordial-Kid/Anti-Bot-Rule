import { Shield, Github, ExternalLink } from 'lucide-react'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-16 border-t border-white/5 bg-[#060b16]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
              <Shield size={14} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">Campus Anti-Bot System</p>
              <p className="text-[11px] text-slate-600">校园网智能防御系统</p>
            </div>
          </div>

          {/* Tech badges */}
          <div className="flex flex-wrap justify-center gap-2">
            {['React 18', 'Tailwind CSS', 'ECharts', 'Framer Motion', 'Vite'].map(tech => (
              <span
                key={tech}
                className="text-[10px] px-2.5 py-1 rounded-full bg-white/4 border border-white/8 text-slate-500"
              >
                {tech}
              </span>
            ))}
          </div>

          {/* Copyright */}
          <div className="text-right text-[11px] text-slate-600">
            <p>© {year} 校园网络安全中心</p>
            <p className="mt-0.5">所有数据已脱敏处理，不涉及个人隐私</p>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-6 pt-5 border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] text-slate-700">
            ⚠️ 本系统采集的浏览器指纹数据仅用于安全威胁检测，不关联任何个人身份信息。
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
            系统运行正常
          </div>
        </div>
      </div>
    </footer>
  )
}
