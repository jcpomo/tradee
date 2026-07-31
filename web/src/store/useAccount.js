import { useMemo } from 'react'
import { useStore } from './useStore'
import {
  calcFloor,
  calcMargin,
  calcProgress,
  calcTradesLeft,
  calcDaysLeft,
  dayStats,
  todayISO,
  sumPnL,
  winRate,
} from '../utils/calculations'

/**
 * Todas las métricas derivadas de la cuenta en un único sitio.
 * Las pantallas consumen esto en vez de recalcular por su cuenta.
 */
export function useAccount() {
  const settings = useStore((s) => s.settings)
  const currentBalance = useStore((s) => s.currentBalance)
  const peakBalance = useStore((s) => s.peakBalance)
  const trades = useStore((s) => s.trades)

  return useMemo(() => {
    const today = todayISO()
    const floor = calcFloor(peakBalance, settings.maxDrawdown)
    const margin = calcMargin(currentBalance, floor)
    const profit = currentBalance - settings.initialBalance
    const progress = calcProgress(currentBalance, settings.initialBalance, settings.profitTarget)
    const tradesLeft = calcTradesLeft(margin, settings.riskPerTrade)
    const daysLeft = calcDaysLeft(settings.startDate, settings.evalDays)
    const stats = dayStats(trades, today, settings.dailyStopLimit)

    // El suelo queda protegido cuando el peak ya cubre el capital inicial + drawdown
    const floorProtected = floor >= settings.initialBalance
    const protectionBalance = settings.initialBalance + settings.maxDrawdown + 100 // $52.100 con los valores por defecto

    // Tonos de alerta según la tabla 3.1 de la spec
    const floorTone = currentBalance < floor + 300 ? 'red' : 'green'
    const marginTone = margin < 200 ? 'red' : margin < 500 ? 'yellow' : margin < 800 ? 'yellow' : 'green'
    const profitTone = profit > 0 ? 'green' : profit < 0 ? 'red' : 'neutral'
    const daysTone = daysLeft < 5 ? 'red' : daysLeft < 10 ? 'yellow' : 'green'
    const tradesLeftTone = tradesLeft < 3 ? 'red' : tradesLeft < 5 ? 'yellow' : 'green'
    const dailyTone =
      stats.dailyRemaining <= 0 ? 'red' : stats.dailyRemaining <= settings.dailyStopLimit * 0.2 ? 'yellow' : 'green'
    const streakTone = stats.consecutiveLosses >= 3 ? 'red' : stats.consecutiveLosses === 2 ? 'yellow' : 'green'

    // Estadísticas globales
    const decidedAll = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS')

    return {
      settings,
      today,
      currentBalance,
      peakBalance,
      floor,
      margin,
      profit,
      progress,
      tradesLeft,
      daysLeft,
      targetBalance: settings.initialBalance + settings.profitTarget,
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
  }, [settings, currentBalance, peakBalance, trades])
}
