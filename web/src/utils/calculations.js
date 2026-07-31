import { INSTRUMENTS } from '../data/instruments'

const MS_DAY = 86400000

export const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/* ── Cuenta ─────────────────────────────────────────────────────────── */

// Suelo actual = Peak Balance − drawdown máximo
export const calcFloor = (peakBalance, maxDrawdown) => num(peakBalance) - num(maxDrawdown)

// Margen disponible = Balance actual − Suelo actual
export const calcMargin = (currentBalance, floor) => num(currentBalance) - num(floor)

// Progreso hacia el objetivo (%)
export const calcProgress = (currentBalance, initialBalance, profitTarget) => {
  const target = num(profitTarget)
  if (target === 0) return 0
  return ((num(currentBalance) - num(initialBalance)) / target) * 100
}

// Trades que quedan antes de tocar el suelo
export const calcTradesLeft = (margin, riskPerTrade) => {
  const risk = num(riskPerTrade)
  if (risk <= 0) return 0
  return Math.max(0, Math.floor(num(margin) / risk))
}

// El peak sube, nunca baja
export const calcPeak = (currentBalance, storedPeak, initialBalance) =>
  Math.max(num(currentBalance), num(storedPeak), num(initialBalance))

// Días restantes de evaluación
export const calcDaysLeft = (startDate, evalDays = 30) => {
  if (!startDate) return evalDays
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return evalDays
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const elapsed = Math.floor((today.getTime() - start.getTime()) / MS_DAY)
  return evalDays - Math.max(0, elapsed)
}

// Stop diario restante. lossesToday es la suma (positiva) de lo perdido hoy.
export const calcDailyRemaining = (dailyStopLimit, lossesToday) =>
  Math.max(0, num(dailyStopLimit) - Math.abs(num(lossesToday)))

/* ── Instrumento ────────────────────────────────────────────────────── */

export const pointValue = (key) => INSTRUMENTS[key]?.pointValue ?? 0
export const tickValue = (key) => INSTRUMENTS[key]?.tickValue ?? 0
export const ticksPerPoint = (key) => INSTRUMENTS[key]?.ticksPerPt ?? 1

// Riesgo en $ dado el SL en puntos
export const riskFromPoints = (contracts, stopPoints, instrument) =>
  num(contracts) * Math.abs(num(stopPoints)) * pointValue(instrument)

// Riesgo en $ dado el SL en ticks
export const riskFromTicks = (contracts, stopTicks, instrument) =>
  num(contracts) * Math.abs(num(stopTicks)) * tickValue(instrument)

export const pointsToTicks = (points, instrument) =>
  Math.abs(num(points)) * ticksPerPoint(instrument)

export const ticksToPoints = (ticks, instrument) =>
  Math.abs(num(ticks)) / ticksPerPoint(instrument)

// P&L de un trade cerrado a partir de los puntos de resultado
export const pnlFromPoints = (contracts, resultPoints, instrument) =>
  num(contracts) * num(resultPoints) * pointValue(instrument)

/* ── Calculadora de trade ───────────────────────────────────────────── */

/**
 * Calcula el trade completo a partir de entrada / SL / TP.
 * direction: 'LONG' | 'SHORT'
 */
export function computeTrade({ instrument, contracts, entry, stopLoss, takeProfit, direction }) {
  const inst = INSTRUMENTS[instrument]
  const e = num(entry)
  const sl = num(stopLoss)
  const tp = num(takeProfit)
  const qty = Math.max(1, num(contracts, 1))

  const hasEntry = Number.isFinite(num(entry, NaN)) && e > 0
  const hasSL = Number.isFinite(num(stopLoss, NaN)) && sl > 0
  const hasTP = Number.isFinite(num(takeProfit, NaN)) && tp > 0

  const stopPoints = hasEntry && hasSL ? Math.abs(e - sl) : 0
  const targetPoints = hasEntry && hasTP ? Math.abs(tp - e) : 0

  const stopTicks = Math.round(pointsToTicks(stopPoints, instrument))
  const targetTicks = Math.round(pointsToTicks(targetPoints, instrument))

  const riskUSD = qty * stopPoints * (inst?.pointValue ?? 0)
  const rewardUSD = qty * targetPoints * (inst?.pointValue ?? 0)
  const rr = stopPoints > 0 ? targetPoints / stopPoints : 0

  // Coherencia de niveles según la dirección
  const errors = []
  if (hasEntry && hasSL) {
    if (direction === 'LONG' && sl >= e) errors.push('En LONG el Stop Loss debe estar por debajo de la entrada')
    if (direction === 'SHORT' && sl <= e) errors.push('En SHORT el Stop Loss debe estar por encima de la entrada')
  }
  if (hasEntry && hasTP) {
    if (direction === 'LONG' && tp <= e) errors.push('En LONG el Take Profit debe estar por encima de la entrada')
    if (direction === 'SHORT' && tp >= e) errors.push('En SHORT el Take Profit debe estar por debajo de la entrada')
  }

  return {
    ready: hasEntry && hasSL,
    hasTP,
    stopPoints,
    targetPoints,
    stopTicks,
    targetTicks,
    riskUSD,
    rewardUSD,
    rr,
    errors,
    bracketText: `TP: ${targetTicks} ticks / SL: ${stopTicks} ticks`,
  }
}

/**
 * Semáforo de la calculadora.
 * VERDE ok · AMARILLO precaución · ROJO no operar
 */
export function tradeSignal({ riskUSD, rr, hasTP, riskPerTrade, minRR, marginAvailable, dailyRemaining, hasErrors }) {
  const reasons = []
  let level = 'green'

  const escalate = (next) => {
    if (next === 'red') level = 'red'
    else if (next === 'yellow' && level !== 'red') level = 'yellow'
  }

  if (hasErrors) {
    escalate('red')
    reasons.push('Los niveles no son coherentes con la dirección')
  }
  if (riskUSD > riskPerTrade) {
    escalate('red')
    reasons.push(`El riesgo supera tu límite de $${riskPerTrade} por trade`)
  } else if (riskUSD > riskPerTrade * 0.85) {
    escalate('yellow')
    reasons.push('El riesgo está al límite de tu plan')
  }
  if (hasTP && rr < minRR) {
    escalate('red')
    reasons.push(`R:R ${rr.toFixed(2)} por debajo de tu mínimo 1:${minRR}`)
  }
  if (!hasTP) {
    escalate('yellow')
    reasons.push('Sin Take Profit definido — no puedes validar el R:R')
  }
  if (Number.isFinite(marginAvailable) && riskUSD > marginAvailable) {
    escalate('red')
    reasons.push('El riesgo del trade supera tu margen hasta el suelo')
  }
  if (Number.isFinite(dailyRemaining) && dailyRemaining <= 0) {
    escalate('red')
    reasons.push('Stop diario agotado — no deberías operar hoy')
  } else if (Number.isFinite(dailyRemaining) && riskUSD > dailyRemaining) {
    escalate('yellow')
    reasons.push('Este trade consume más de lo que te queda de stop diario')
  }

  if (level === 'green' && reasons.length === 0) reasons.push('Dentro de todos los límites de tu plan')

  return { level, reasons }
}

/* ── Diario ─────────────────────────────────────────────────────────── */

export const todayISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export const nowTime = () => new Date().toTimeString().slice(0, 5)

export const tradesOfDay = (trades, day) => trades.filter((t) => t.date === day)

export const sumPnL = (trades) => trades.reduce((acc, t) => acc + num(t.pnl), 0)

export const lossesOfDay = (trades) =>
  Math.abs(trades.filter((t) => num(t.pnl) < 0).reduce((acc, t) => acc + num(t.pnl), 0))

export const winRate = (trades) => {
  const decided = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS')
  if (decided.length === 0) return 0
  return (decided.filter((t) => t.result === 'WIN').length / decided.length) * 100
}

// Pérdidas consecutivas al final del día (racha viva, en orden cronológico)
export const consecutiveLosses = (trades) => {
  const ordered = [...trades].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  let streak = 0
  for (let i = ordered.length - 1; i >= 0; i--) {
    const r = ordered[i].result
    if (r === 'LOSS') streak++
    else if (r === 'WIN') break
    // BE no rompe ni suma la racha
  }
  return streak
}

export const dayStats = (trades, day, dailyStopLimit) => {
  const list = tradesOfDay(trades, day)
  const losses = lossesOfDay(list)
  return {
    trades: list,
    count: list.length,
    pnl: sumPnL(list),
    wins: list.filter((t) => t.result === 'WIN').length,
    losses: list.filter((t) => t.result === 'LOSS').length,
    be: list.filter((t) => t.result === 'BE').length,
    winRate: winRate(list),
    lossesUSD: losses,
    consecutiveLosses: consecutiveLosses(list),
    dailyRemaining: calcDailyRemaining(dailyStopLimit, losses),
  }
}

/* ── Formato ────────────────────────────────────────────────────────── */

export const fmtUSD = (v, decimals = 0) =>
  `${num(v) < 0 ? '-' : ''}$${Math.abs(num(v)).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`

export const fmtSignedUSD = (v, decimals = 0) => {
  const n = num(v)
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export const fmtNum = (v, decimals = 2) =>
  num(v).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const fmtPct = (v, decimals = 1) => `${num(v).toFixed(decimals)}%`

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}
