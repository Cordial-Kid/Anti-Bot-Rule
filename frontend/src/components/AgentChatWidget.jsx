import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { queryAgent } from '../api'

const QUICK_QUESTIONS = [
  '请告诉我过去十天的bot流量',
  '最近一周高风险指纹数量是多少',
  '今天的Bot占比怎么样',
  '过去14天风险趋势如何',
]

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function Bubble({ role, content, pending = false }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6 border ${
          isUser
            ? 'bg-cyan-500/20 border-cyan-400/35 text-cyan-100'
            : 'bg-slate-900/80 border-slate-700/70 text-slate-100'
        }`}
      >
        {pending ? (
          <span className="inline-flex items-center gap-1 text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />
            正在查询中
          </span>
        ) : (
          content
        )}
      </div>
    </div>
  )
}

export default function AgentChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: createId('assistant'),
      role: 'assistant',
      content: '我是只读数据 Agent。你可以问我趋势、占比、过去N天的Bot流量等问题。',
    },
  ])

  const scrollRef = useRef(null)

  const canSend = useMemo(() => {
    return input.trim().length > 0 && !loading
  }, [input, loading])

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }

  const sendQuestion = async (text) => {
    const question = String(text ?? '').trim()
    if (!question || loading) return

    setLoading(true)
    setInput('')

    const userMessage = {
      id: createId('user'),
      role: 'user',
      content: question,
    }

    const pendingMessage = {
      id: createId('pending'),
      role: 'assistant',
      pending: true,
      content: '',
    }

    setMessages((prev) => [...prev, userMessage, pendingMessage])
    scrollToBottom()

    try {
      const result = await queryAgent(question, { scene: 'dashboard_widget' })
      const answer = String(result?.answer ?? '暂时未获取到结果，请稍后再试。')

      setMessages((prev) => {
        const withoutPending = prev.filter((item) => !item.pending)
        return [
          ...withoutPending,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: answer,
          },
        ]
      })
    } catch (err) {
      setMessages((prev) => {
        const withoutPending = prev.filter((item) => !item.pending)
        return [
          ...withoutPending,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: '查询失败，请稍后重试。',
          },
        ]
      })
      console.warn('[agent-widget] query failed:', err)
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  return (
    <div className="fixed z-[70] right-4 bottom-4 sm:right-6 sm:bottom-6">
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className="mb-3 w-[calc(100vw-2rem)] sm:w-[430px] h-[72vh] sm:h-[560px] rounded-2xl border border-cyan-400/25 bg-[rgba(12,20,36,0.9)] backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col"
          >
            <header className="px-4 py-3 border-b border-cyan-400/20 bg-cyan-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-cyan-200">安全数据 Agent</h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">只读查询，无写入权限</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-500/60 text-slate-200 hover:border-cyan-400/50"
                >
                  关闭
                </button>
              </div>
            </header>

            <div className="px-4 pt-3 pb-2 border-b border-white/5">
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendQuestion(q)}
                    disabled={loading}
                    className="text-[11px] px-2.5 py-1.5 rounded-full border border-cyan-400/25 text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-60"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg) => (
                <Bubble key={msg.id} role={msg.role} content={msg.content} pending={msg.pending} />
              ))}
            </div>

            <form
              className="px-4 pb-4 pt-2 border-t border-white/5 bg-[rgba(8,13,26,0.6)]"
              onSubmit={(e) => {
                e.preventDefault()
                sendQuestion(input)
              }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  placeholder="例如：请告诉我过去十天的bot流量"
                  className="flex-1 min-h-[78px] max-h-40 resize-y rounded-lg border border-slate-700/80 bg-slate-900/80 text-sm leading-6 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="px-3.5 py-2.5 rounded-lg text-sm font-medium bg-cyan-500/85 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  发送
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative h-12 min-w-[92px] px-4 rounded-full border border-cyan-400/40 bg-cyan-500/15 backdrop-blur-md shadow-[0_0_25px_rgba(0,212,255,0.3)] hover:bg-cyan-500/25 transition"
      >
        <span className="absolute inset-0 rounded-full border border-cyan-400/40 animate-ping opacity-20" />
        <span className="relative text-cyan-100 text-base font-semibold tracking-wide">Agent</span>
      </button>
    </div>
  )
}
