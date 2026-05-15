/**
 * 浏览器指纹采集工具
 * ─────────────────────────────────────────────────────────
 * Level 1 — 基础浏览器 / 设备属性
 * Level 2 — Canvas / WebGL 硬件指纹
 * Level 3 — 高级 API 检测 & 自动化特征识别
 */

// ═══════════════════════════════════════════════
//  内部工具
// ═══════════════════════════════════════════════

/** djb2 变体哈希 — 将字符串映射为无符号 32 位整数 */
function hashDjb2(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
  }
  return h >>> 0
}

/** 双段哈希，输出 16 位大写十六进制 */
function longHash(str) {
  const a = hashDjb2(str).toString(16).padStart(8, '0')
  const b = hashDjb2(str + '\u00b7salt').toString(16).padStart(8, '0')
  return (a + b).toUpperCase()
}

// ═══════════════════════════════════════════════
//  Level 1 — 基础属性
// ═══════════════════════════════════════════════

export function collectLevel1() {
  return {
    userAgent          : navigator.userAgent,
    platform           : navigator.platform,
    language           : navigator.language,
    languages          : [...(navigator.languages ?? [])].join(','),
    cookiesEnabled     : navigator.cookieEnabled,
    doNotTrack         : navigator.doNotTrack ?? 'unspecified',
    screenWidth        : screen.width,
    screenHeight       : screen.height,
    availWidth         : screen.availWidth,
    availHeight        : screen.availHeight,
    colorDepth         : screen.colorDepth,
    pixelDepth         : screen.pixelDepth,
    devicePixelRatio   : window.devicePixelRatio ?? 1,
    innerWidth         : window.innerWidth,
    innerHeight        : window.innerHeight,
    timezone           : Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset     : new Date().getTimezoneOffset(),
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    deviceMemory       : navigator.deviceMemory ?? 'unknown',
    maxTouchPoints     : navigator.maxTouchPoints ?? 0,
  }
}

// ═══════════════════════════════════════════════
//  Level 2 — Canvas 指纹
// ═══════════════════════════════════════════════

export function collectLevel2Canvas() {
  try {
    const c   = document.createElement('canvas')
    c.width   = 300
    c.height  = 68
    const ctx = c.getContext('2d')
    if (!ctx) return { canvasHash: 'ctx-blocked', canvasBlocked: true }

    ctx.fillStyle = '#080d1a'
    ctx.fillRect(0, 0, c.width, c.height)

    ctx.textBaseline = 'alphabetic'
    ctx.font         = 'bold 15px Arial, "Helvetica Neue", sans-serif'
    ctx.fillStyle    = 'rgba(0,212,255,0.85)'
    ctx.fillText('Anti-Bot \u6307\u7EB9\u68C0\u6D4B', 8, 28)

    ctx.font      = '12px "Courier New", Consolas, monospace'
    ctx.fillStyle = 'rgba(0,255,136,0.65)'
    ctx.fillText(`\u03C0 = ${Math.PI.toFixed(12)}`, 8, 50)

    ctx.beginPath()
    ctx.arc(272, 34, 22, 0, 2 * Math.PI)
    const grad = ctx.createRadialGradient(272,34,4,272,34,22)
    grad.addColorStop(0, 'rgba(255,107,53,0.7)')
    grad.addColorStop(1, 'rgba(255,59,85,0.1)')
    ctx.fillStyle = grad
    ctx.fill()

    const dataURL = c.toDataURL('image/png')
    // 指纹随机化检测：被反指纹工具干扰时 dataURL 极短
    const spoofed = dataURL.length < 1200

    return {
      canvasHash   : longHash(dataURL).slice(0, 16),
      canvasLength : dataURL.length,
      canvasBlocked: false,
      canvasSpoofed: spoofed,
    }
  } catch {
    return { canvasHash: 'error', canvasBlocked: true, canvasSpoofed: true }
  }
}

// ═══════════════════════════════════════════════
//  Level 2 — WebGL 指纹
// ═══════════════════════════════════════════════

export function collectLevel2WebGL() {
  try {
    const c  = document.createElement('canvas')
    const gl = c.getContext('webgl') ?? c.getContext('experimental-webgl')
    if (!gl) return { webglSupported: false, webglVendor: '不支持', webglRenderer: '不支持' }

    const dbg      = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor   = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR)
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    const version  = gl.getParameter(gl.VERSION)
    const extCount = gl.getSupportedExtensions()?.length ?? 0

    // 渲染一个简单三角形并读取像素哈希
    c.width = c.height = 64
    const vsh = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vsh, `attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}`)
    gl.compileShader(vsh)
    const fsh = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fsh, `precision mediump float;void main(){gl_FragColor=vec4(0.,0.831,1.,1.);}`)
    gl.compileShader(fsh)
    const prog = gl.createProgram()
    gl.attachShader(prog, vsh)
    gl.attachShader(prog, fsh)
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5,0.5,-0.5,-0.5,0.5,-0.5]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    gl.viewport(0, 0, 64, 64)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const px = new Uint8Array(64 * 64 * 4)
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px)

    return {
      webglSupported: true,
      webglVendor   : vendor,
      webglRenderer : renderer,
      webglVersion  : version,
      webglExtCount : extCount,
      webglHash     : longHash(px.slice(0,128).join(',')).slice(0, 12),
    }
  } catch (e) {
    return { webglSupported: false, webglVendor: '错误', webglRenderer: String(e.message) }
  }
}

// ═══════════════════════════════════════════════
//  Level 3 — 自动化特征检测
// ═══════════════════════════════════════════════

export function collectLevel3() {
  const s = {}
  const ua = navigator.userAgent

  // 1. WebDriver 标志位（Selenium/Puppeteer 等会暴露）
  s.webdriver = navigator.webdriver === true

  // 2. Chrome 插件数量（无头 Chrome 通常为 0）
  s.pluginCount = navigator.plugins?.length ?? 0
  s.noPlugins   = s.pluginCount === 0 && /Chrome/.test(ua)

  // 3. window.chrome 对象（真实 Chrome 必定存在）
  s.hasChrome       = !!window.chrome
  s.isChromeBrowser = /Chrome\//.test(ua) && !/Edg|OPR/.test(ua)
  s.chromeMismatch  = s.isChromeBrowser && !s.hasChrome

  // 4. 移动端 UA 但 maxTouchPoints === 0
  s.isMobile     = /Mobile|Android|iPhone|iPad/.test(ua)
  s.touchMismatch= s.isMobile && (navigator.maxTouchPoints ?? 0) === 0

  // 5. AudioContext
  try {
    const AudioCtx    = window.AudioContext ?? window.webkitAudioContext
    if (AudioCtx) {
      const ctx         = new AudioCtx()
      s.audioCtxState   = ctx.state
      s.hasAudio        = true
      ctx.close?.()
    } else { s.hasAudio = false }
  } catch { s.hasAudio = false }

  // 6. Function.toString 原生性（被 Proxy 篡改则为 false）
  s.functionNative = Function.prototype.toString.toString().includes('[native code]')

  // 7. Permissions API
  s.hasPermissions = 'permissions' in navigator

  // 8. 硬件并发（0 为异常）
  s.cpuCores     = navigator.hardwareConcurrency ?? 0
  s.suspiciousCPU= s.cpuCores === 0

  // 9. 历史长度（自动化工具通常为 1）
  s.historyLength = history.length

  // 10. 语言一致性
  s.langConsistent = !!(navigator.language && navigator.languages?.length)

  // 11. 时区一致性
  const tzOffset = new Date().getTimezoneOffset()
  const tzName   = Intl.DateTimeFormat().resolvedOptions().timeZone
  s.timezoneConsistent = !!(tzOffset !== undefined && tzName)

  // 12. 屏幕尺寸异常（某些无头浏览器默认 800×600）
  s.defaultScreenSize = screen.width === 800 && screen.height === 600

  return s
}

// ═══════════════════════════════════════════════
//  设备 ID 生成 & 显示脱敏
// ═══════════════════════════════════════════════

export function generateDeviceId(data) {
  return longHash(JSON.stringify(data))
}

/** 将 16 位 ID 格式化为 XXXX-****-****-XXXX */
export function maskDeviceId(id = '') {
  const s = id.padEnd(16, '0').slice(0, 16)
  return `${s.slice(0,4)}-****-****-${s.slice(12,16)}`
}

// ═══════════════════════════════════════════════
//  风险评分
// ═══════════════════════════════════════════════

export function calculateRiskScore(l1, l2canvas, l3) {
  let risk    = 0
  const reasons = []

  if (l3.webdriver)         { risk += 40; reasons.push('检测到 WebDriver 标志位') }
  if (l3.noPlugins)         { risk += 25; reasons.push('Chrome 中无任何浏览器插件') }
  if (l3.chromeMismatch)    { risk += 20; reasons.push('Chrome UA 与 window.chrome 不一致') }
  if (l3.touchMismatch)     { risk += 15; reasons.push('移动端 UA 但触摸点为 0') }
  if (!l3.hasAudio)         { risk += 10; reasons.push('AudioContext 不可用') }
  if (!l3.functionNative)   { risk += 30; reasons.push('Function.toString 被修改（已注入）') }
  if (l2canvas.canvasSpoofed) { risk += 15; reasons.push('Canvas 指纹已被随机化') }
  if (l3.defaultScreenSize) { risk += 10; reasons.push('屏幕尺寸为默认无头浏览器值') }
  if (l3.suspiciousCPU)     { risk += 10; reasons.push('CPU 核心数为 0（异常）') }

  risk = Math.min(100, risk)

  let level, label, color
  if      (risk < 20) { level='safe';     label='低风险 — 真实用户';         color='#00ff88' }
  else if (risk < 45) { level='warning';  label='中等风险 — 存在可疑特征';   color='#ffcc00' }
  else if (risk < 70) { level='danger';   label='高风险 — 疑似自动化脚本';   color='#ff6b35' }
  else                { level='critical'; label='极高风险 — 确认为脚本程序'; color='#ff3b55' }

  return { risk, level, label, color, reasons }
}

/**
 * 指纹唯一性评分（越高越独特）
 * 注：此分值仅用于科普展示，非严格统计学意义
 */
export function calculateUniqueness(l1, l2canvas, l2webgl) {
  let score = 50
  if (!l2canvas.canvasBlocked && !l2canvas.canvasSpoofed) score += 22
  if (l2webgl.webglSupported && l2webgl.webglRenderer)     score += 15
  if (l1.language && l1.timezone)                          score +=  7
  if (l1.devicePixelRatio !== 1)                           score +=  3
  if (l1.hardwareConcurrency > 2)                          score +=  3
  return Math.min(100, score)
}

// ═══════════════════════════════════════════════
//  完整采集流程（带进度回调）
// ═══════════════════════════════════════════════

const STEPS = [
  { key:'init',     label:'初始化检测引擎',               ms:200 },
  { key:'canvas',   label:'采集 Canvas 指纹 (Level 2)',   ms:400 },
  { key:'webgl',    label:'提取 WebGL 渲染特征 (Level 2)',ms:450 },
  { key:'browser',  label:'扫描浏览器基础属性 (Level 1)', ms:300 },
  { key:'bot',      label:'检测自动化脚本特征 (Level 3)', ms:350 },
  { key:'deviceid', label:'生成唯一设备指纹 ID',           ms:250 },
  { key:'score',    label:'计算安全风险评分',              ms:300 },
  { key:'report',   label:'生成检测报告',                  ms:200 },
]

export async function collectFullFingerprint(onProgress) {
  const results = {}

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    onProgress?.({ label: step.label, stepIndex: i, total: STEPS.length, done: false })
    await new Promise(r => setTimeout(r, step.ms + Math.random() * 150))

    switch (step.key) {
      case 'canvas':
        results.level2Canvas = collectLevel2Canvas()
        break
      case 'webgl':
        results.level2WebGL = collectLevel2WebGL()
        break
      case 'browser':
        results.level1 = collectLevel1()
        break
      case 'bot':
        results.level3 = collectLevel3()
        break
      case 'deviceid':
        results.rawDeviceId    = generateDeviceId({ ...results.level1, ...results.level2Canvas, ...results.level2WebGL })
        results.maskedDeviceId = maskDeviceId(results.rawDeviceId)
        break
      case 'score':
        if (results.level1 && results.level2Canvas && results.level3) {
          results.riskAssessment = calculateRiskScore(results.level1, results.level2Canvas, results.level3)
          results.uniquenessScore = calculateUniqueness(results.level1, results.level2Canvas, results.level2WebGL)
        }
        break
    }

    onProgress?.({ label: step.label, stepIndex: i, total: STEPS.length, done: true })
  }

  return results
}