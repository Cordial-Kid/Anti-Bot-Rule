/** 通用毛玻璃卡片组件 */
import { motion } from 'framer-motion'

const glowMap = {
  blue  : 'border-cyan-400/15   hover:border-cyan-400/40   hover:shadow-[0_0_32px_rgba(0,212,255,0.18)]',
  green : 'border-green-400/15  hover:border-green-400/40  hover:shadow-[0_0_32px_rgba(0,255,136,0.18)]',
  orange: 'border-orange-400/15 hover:border-orange-400/40 hover:shadow-[0_0_32px_rgba(255,107,53,0.18)]',
  red   : 'border-red-500/15    hover:border-red-500/40    hover:shadow-[0_0_32px_rgba(255,59,85,0.18)]',
}

export default function GlassCard({
  children,
  className = '',
  glow      = 'blue',
  initial   = { opacity: 0, y: 20 },
  animate   = { opacity: 1, y: 0 },
  transition= { duration: 0.45 },
  ...rest
}) {
  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={transition}
      className={`
        relative overflow-hidden rounded-2xl
        bg-[rgba(13,20,40,0.82)] backdrop-blur-xl
        border transition-all duration-300
        ${glowMap[glow] ?? glowMap.blue}
        ${className}
      `}
      {...rest}
    >
      {/* Top edge light strip */}
      <div className="absolute top-0 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent pointer-events-none" />
      {children}
    </motion.div>
  )
}
