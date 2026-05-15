/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'cyber-blue': '#00d4ff',
        'aurora-green': '#00ff88',
        'warning-orange': '#ff6b35',
        'danger-red': '#ff3b55',
        'caution-yellow': '#ffcc00',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow-blue': 'glowBlue 2s ease-in-out infinite alternate',
        'scan-line': 'scanLine 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'counter-flip': 'counterFlip 0.4s ease-out',
        'data-stream': 'dataStream 1.5s ease-out forwards',
        'border-glow': 'borderGlow 3s ease-in-out infinite',
        'ping-slow': 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
      },
      keyframes: {
        glowBlue: {
          '0%': { boxShadow: '0 0 5px rgba(0,212,255,0.2)' },
          '100%': { boxShadow: '0 0 25px rgba(0,212,255,0.7), 0 0 50px rgba(0,212,255,0.2)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100vh)' },
          '100%': { transform: 'translateY(200vh)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        counterFlip: {
          '0%': { transform: 'rotateX(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0)', opacity: '1' },
        },
        dataStream: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-40px)' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(0,212,255,0.2)' },
          '50%': { borderColor: 'rgba(0,212,255,0.6)' },
        },
      },
    },
  },
  plugins: [],
}
