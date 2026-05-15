/**
 * EChart — 自定义 ECharts 封装组件
 * 使用 echarts 原生 API，避免引入 echarts-for-react
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export default function EChart({ option, style, className = '', onChartReady }) {
  const elRef       = useRef(null)
  const chartRef    = useRef(null)

  useEffect(() => {
    if (!elRef.current) return
    chartRef.current = echarts.init(elRef.current, 'dark', { renderer: 'canvas' })
    onChartReady?.(chartRef.current)

    const handleResize = () => chartRef.current?.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chartRef.current?.dispose()
    }
  }, [])          // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chartRef.current || !option) return
    chartRef.current.setOption(option, { notMerge: false, lazyUpdate: false })
  }, [option])

  return <div ref={elRef} style={{ width: '100%', ...style }} className={className} />
}
