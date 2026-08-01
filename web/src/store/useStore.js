import { create } from 'zustand'
import * as api from '../api/endpoints'
import { todayISO, num } from '../utils/calculations'

// Valores usados solo como referencia de UI (rangos, placeholders al borrar un campo, etc.).
// La fuente de verdad de estos valores es la cuenta activa que sirve la API.
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

export const useStore = create((set, get) => ({
  account: null, // la cuenta activa completa (settings + estado), viene de la API
  trades: [],
  dailyRecords: [],
  checklist: {}, // { [index]: boolean } — checklist pre-trade (solo cliente)
  lastCalc: null, // último cálculo de la calculadora (solo cliente)
  hydrated: false,

  /* ── Carga inicial desde la API ───────────────────────────────────── */

  async hydrate(accountId) {
    const [{ account }, { trades }, { records }] = await Promise.all([
      api.getState(accountId),
      api.listTrades(accountId),
      api.listDailyRecords(accountId),
    ])
    set({ account, trades, dailyRecords: records, hydrated: true })
  },

  resetForAccountSwitch() {
    set({ hydrated: false, account: null, trades: [], dailyRecords: [] })
  },

  /* ── Cuenta ───────────────────────────────────────────────── */

  async setBalance(value) {
    const a = get().account
    const balance = num(value)
    const peak = Math.max(balance, num(a.peakBalance), num(a.initialBalance))
    set({ account: { ...a, currentBalance: balance, peakBalance: peak } })
    await api.patchAccount(a.id, { currentBalance: balance, peakBalance: peak })
  },

  async setPeakBalance(value) {
    const a = get().account
    const peak = Math.max(num(value), num(a.currentBalance), num(a.initialBalance))
    set({ account: { ...a, peakBalance: peak } })
    await api.patchAccount(a.id, { peakBalance: peak })
  },

  /* ── Configuración ────────────────────────────────────────── */

  async updateSettings(patch) {
    const a = get().account
    const next = { ...a, ...patch }
    set({ account: next })
    await api.patchAccount(a.id, patch)
  },

  async resetSettings() {
    const a = get().account
    const patch = {
      initialBalance: DEFAULT_SETTINGS.initialBalance,
      maxDrawdown: DEFAULT_SETTINGS.maxDrawdown,
      profitTarget: DEFAULT_SETTINGS.profitTarget,
      startDate: todayISO(),
      evalDays: DEFAULT_SETTINGS.evalDays,
      riskPerTrade: DEFAULT_SETTINGS.riskPerTrade,
      dailyStopLimit: DEFAULT_SETTINGS.dailyStopLimit,
      minRR: DEFAULT_SETTINGS.minRR,
      maxTradesPerDay: DEFAULT_SETTINGS.maxTradesPerDay,
      defaultContracts: DEFAULT_SETTINGS.defaultContracts,
      defaultInstrument: DEFAULT_SETTINGS.defaultInstrument,
      accountKind: DEFAULT_SETTINGS.accountType,
    }
    set({ account: { ...a, ...patch } })
    await api.patchAccount(a.id, patch)
  },

  /* ── Diario de trades ─────────────────────────────────────── */

  async addTrade(trade) {
    const a = get().account
    const { trade: created } = await api.createTrade(a.id, {
      ...trade,
      pnl: num(trade.pnl),
      contracts: num(trade.contracts, 1),
    })
    set((s) => ({ trades: [...s.trades, created] }))
  },

  async updateTrade(id, patch) {
    const { trade } = await api.patchTrade(id, patch)
    set((s) => ({ trades: s.trades.map((t) => (t.id === id ? trade : t)) }))
  },

  async deleteTrade(id) {
    await api.deleteTradeApi(id)
    set((s) => ({ trades: s.trades.filter((t) => t.id !== id) }))
  },

  /* ── Seguimiento del suelo ────────────────────────────────── */

  async addDailyRecord(record) {
    const a = get().account
    const { record: saved } = await api.upsertDailyRecord(a.id, record)
    set((s) => ({ dailyRecords: [...s.dailyRecords.filter((r) => r.date !== saved.date), saved] }))
  },

  async deleteDailyRecord(id) {
    await api.deleteDailyRecordApi(id)
    set((s) => ({ dailyRecords: s.dailyRecords.filter((r) => r.id !== id) }))
  },

  /* ── Checklist pre-trade ──────────────────────────────────── */

  toggleChecklist(index) {
    set((s) => ({ checklist: { ...s.checklist, [index]: !s.checklist[index] } }))
  },

  resetChecklist() {
    set({ checklist: {} })
  },

  /* ── Calculadora (recuerda el último cálculo) ─────────────── */

  setLastCalc(calc) {
    set({ lastCalc: calc })
  },
}))
