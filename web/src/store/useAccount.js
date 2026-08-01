import { useMemo } from 'react'
import { useStore } from './useStore'
import {
  calcFloorByMode,
  calcMargin,
  calcProgress,
  calcTradesLeft,
  calcDaysLeft,
  dayStats,
  todayISO,
  sumPnL,
  winRate,
} from '../utils/calculations'

// Cuenta "vacía" usada solo mientras `hydrate()` todavía no ha llegado — App.jsx no
// renderiza pantallas hasta que `hydrated` es true, así que esto es solo una red de seguridad.
const EMPTY_ACCOUNT = {
  id: null,
  drawdownMode: 'intraday',
  initialBalance: 0,
  maxDrawdown: 0,
  profitTarget: 0,
  startDate: todayISO(),
  evalDays: 30,
  currentBalance: 0,
  peakBalance: 0,
  riskPerTrade: 0,
  dailyStopLimit: 0,
  minRR: 2,
  maxTradesPerDay: 6,
  defaultContracts: 1,
  defaultInstrument: 'MNQ',
  accountKind: 'Evaluación',
}

/**
 * Todas las métricas derivadas de la cuenta en un único sitio.
 * Las pantallas consumen esto en vez de recalcular por su cuenta.
 */
export function useAccount() {
  const account = useStore((s) => s.account)
  const trades = useStore((s) => s.trades)
  const dailyRecords = useStore((s) => s.dailyRecords)

  return useMemo(() => {
    const a = account || EMPTY_ACCOUNT
    const today = todayISO()
    const dailyCloses = dailyRecords.map((r) => r.close)

    // Suelo según el modo de drawdown de la cuenta (intraday / eod / static)
    const floor = calcFloorByMode({
      mode: a.drawdownMode,
      peakBalance: a.peakBalance,
      currentBalance: a.currentBalance,
      initialBalance: a.initialBalance,
      maxDrawdown: a.maxDrawdown,
      dailyCloses,
    })
    const margin = calcMargin(a.currentBalance, floor)
    const profit = a.currentBalance - a.initialBalance
    const progress = calcProgress(a.currentBalance, a.initialBalance, a.profitTarget)
    const tradesLeft = calcTradesLeft(margin, a.riskPerTrade)
    const daysLeft = calcDaysLeft(a.startDate, a.evalDays)
    const stats = dayStats(trades, today, a.dailyStopLimit)

    // El suelo queda protegido cuando el peak ya cubre el capital inicial + drawdown
    const floorProtected = floor >= a.initialBalance
    const protectionBalance = a.initialBalance + a.maxDrawdown + 100 // $52.100 con los valores por defecto

    // Tonos de alerta según la tabla 3.1 de la spec
    const floorTone = a.currentBalance < floor + 300 ? 'red' : 'green'
    const marginTone = margin < 200 ? 'red' : margin < 500 ? 'yellow' : margin < 800 ? 'yellow' : 'green'
    const profitTone = profit > 0 ? 'green' : profit < 0 ? 'red' : 'neutral'
    const daysTone = daysLeft < 5 ? 'red' : daysLeft < 10 ? 'yellow' : 'green'
    const tradesLeftTone = tradesLeft < 3 ? 'red' : tradesLeft < 5 ? 'yellow' : 'green'
    const dailyTone =
      stats.dailyRemaining <= 0 ? 'red' : stats.dailyRemaining <= a.dailyStopLimit * 0.2 ? 'yellow' : 'green'
    const streakTone = stats.consecutiveLosses >= 3 ? 'red' : stats.consecutiveLosses === 2 ? 'yellow' : 'green'

    // Estadísticas globales
    const decidedAll = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS')

    // Compatibilidad con las pantallas: exponen `settings.*` igual que antes de la Fase 2
    const settings = {
      initialBalance: a.initialBalance,
      maxDrawdown: a.maxDrawdown,
      profitTarget: a.profitTarget,
      startDate: a.startDate,
      evalDays: a.evalDays,
      riskPerTrade: a.riskPerTrade,
      dailyStopLimit: a.dailyStopLimit,
      minRR: a.minRR,
      maxTradesPerDay: a.maxTradesPerDay,
      defaultContracts: a.defaultContracts,
      defaultInstrument: a.defaultInstrument,
      accountType: a.accountKind,
    }

    return {
      account: a,
      settings,
      today,
      currentBalance: a.currentBalance,
      peakBalance: a.peakBalance,
      floor,
      margin,
      profit,
      progress,
      tradesLeft,
      daysLeft,
      targetBalance: a.initialBalance + a.profitTarget,
      floorProtected,
      protectionBalance,
      dayStats: stats,
      tones: { floorTone, marginTone, profitTone, daysTone, tradesLeftTone, dailyTone, streakTone },
      global: {
        totalTrades: trades.length,
        decided: decidedAll.length,
        winRate: winRate(trades),
        pnl: sumPnL(trades),
        wins: trades.filter((t) => t.result === 'WIN').length,
        losses: trades.filter((t) => t.result === 'LOSS').length,
        be: trades.filter((t) => t.result === 'BE').length,
      },
    }
  }, [account, trades, dailyRecords])
}
