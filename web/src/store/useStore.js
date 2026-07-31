import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_KEY } from '../utils/storage'
import { todayISO, calcPeak, num } from '../utils/calculations'

export const DEFAULT_SETTINGS = {
  initialBalance: 50000,
  maxDrawdown: 2000,
  profitTarget: 3000,
  startDate: todayISO(),
  evalDays: 30,
  riskPerTrade: 200,
  dailyStopLimit: 600,
  minRR: 2,
  maxTradesPerDay: 6,
  defaultContracts: 1,
  defaultInstrument: 'MNQ',
  accountType: 'Evaluación', // 'Evaluación' | 'PA'
}

export const SETTINGS_RANGES = {
  riskPerTrade: [50, 400],
  dailyStopLimit: [200, 1000],
  minRR: [1, 5],
  maxTradesPerDay: [1, 20],
  defaultContracts: [1, 6],
}

const initialState = {
  settings: { ...DEFAULT_SETTINGS },
  currentBalance: 50000,
  peakBalance: 50000,
  trades: [], // { id, date, time, instrument, direction, contracts, result, pnl, strategy, notes }
  dailyRecords: [], // { id, date, open, close, peak, note }
  checklist: {}, // { [index]: boolean } — checklist pre-trade
  lastCalc: null,
}

export const useStore = create()(
  persist(
    (set, get) => ({
      ...initialState,

      /* ── Cuenta ───────────────────────────────────────────────── */

      setBalance: (value) => {
        const balance = num(value)
        const { peakBalance, settings } = get()
        set({
          currentBalance: balance,
          // El peak se autoguarda si el balance actual lo supera
          peakBalance: calcPeak(balance, peakBalance, settings.initialBalance),
        })
      },

      setPeakBalance: (value) => {
        const { currentBalance, settings } = get()
        set({ peakBalance: Math.max(num(value), num(currentBalance), num(settings.initialBalance)) })
      },

      /* ── Configuración ────────────────────────────────────────── */

      updateSettings: (patch) =>
        set((s) => {
          const settings = { ...s.settings, ...patch }
          return {
            settings,
            peakBalance: calcPeak(s.currentBalance, s.peakBalance, settings.initialBalance),
          }
        }),

      resetSettings: () => set({ settings: { ...DEFAULT_SETTINGS, startDate: todayISO() } }),

      /* ── Diario de trades ─────────────────────────────────────── */

      addTrade: (trade) =>
        set((s) => ({
          trades: [
            ...s.trades,
            {
              id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ...trade,
              pnl: num(trade.pnl),
              contracts: num(trade.contracts, 1),
            },
          ],
        })),

      updateTrade: (id, patch) =>
        set((s) => ({
          trades: s.trades.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTrade: (id) => set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),

      clearTrades: () => set({ trades: [] }),

      /* ── Seguimiento del suelo ────────────────────────────────── */

      addDailyRecord: (record) =>
        set((s) => {
          const id = `d_${record.date}`
          const existing = s.dailyRecords.find((r) => r.id === id)
          const entry = { id, ...record }
          return {
            dailyRecords: existing
              ? s.dailyRecords.map((r) => (r.id === id ? { ...r, ...entry } : r))
              : [...s.dailyRecords, entry],
          }
        }),

      deleteDailyRecord: (id) => set((s) => ({ dailyRecords: s.dailyRecords.filter((r) => r.id !== id) })),

      /* ── Checklist pre-trade ──────────────────────────────────── */

      toggleChecklist: (index) =>
        set((s) => ({ checklist: { ...s.checklist, [index]: !s.checklist[index] } })),

      resetChecklist: () => set({ checklist: {} }),

      /* ── Calculadora (recuerda el último cálculo) ─────────────── */

      setLastCalc: (calc) => set({ lastCalc: calc }),

      /* ── Import / export / reset ──────────────────────────────── */

      exportJSON: () => {
        const { settings, currentBalance, peakBalance, trades, dailyRecords, checklist } = get()
        return JSON.stringify(
          { version: 1, exportedAt: new Date().toISOString(), settings, currentBalance, peakBalance, trades, dailyRecords, checklist },
          null,
          2,
        )
      },

      importJSON: (json) => {
        const data = typeof json === 'string' ? JSON.parse(json) : json
        if (!data || typeof data !== 'object') throw new Error('El archivo no contiene datos válidos')
        set((s) => ({
          settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          currentBalance: num(data.currentBalance, s.currentBalance),
          peakBalance: num(data.peakBalance, s.peakBalance),
          trades: Array.isArray(data.trades) ? data.trades : s.trades,
          dailyRecords: Array.isArray(data.dailyRecords) ? data.dailyRecords : s.dailyRecords,
          checklist: data.checklist && typeof data.checklist === 'object' ? data.checklist : {},
        }))
      },

      resetAll: () =>
        set({
          ...initialState,
          settings: { ...DEFAULT_SETTINGS, startDate: todayISO() },
          trades: [],
          dailyRecords: [],
          checklist: {},
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)

/* ── Selectores derivados ───────────────────────────────────────── */

export const selectFloor = (s) => s.peakBalance - s.settings.maxDrawdown
export const selectMargin = (s) => s.currentBalance - selectFloor(s)
