import { apiFetch } from './client'

const qs = (accountId) => `?accountId=${encodeURIComponent(accountId)}`

export const getState = (accountId) => apiFetch(`/api/state${accountId ? qs(accountId) : ''}`)

export const listTrades = (accountId) => apiFetch(`/api/trades${qs(accountId)}`)
export const createTrade = (accountId, t) => apiFetch(`/api/trades${qs(accountId)}`, { method: 'POST', body: t })
export const patchTrade = (id, p) => apiFetch(`/api/trades/${id}`, { method: 'PATCH', body: p })
export const deleteTradeApi = (id) => apiFetch(`/api/trades/${id}`, { method: 'DELETE' })

export const listDailyRecords = (accountId) => apiFetch(`/api/daily-records${qs(accountId)}`)
export const upsertDailyRecord = (accountId, r) => apiFetch(`/api/daily-records${qs(accountId)}`, { method: 'POST', body: r })
export const deleteDailyRecordApi = (id) => apiFetch(`/api/daily-records/${id}`, { method: 'DELETE' })

export const patchAccount = (id, patch) => apiFetch(`/api/accounts/${id}`, { method: 'PATCH', body: patch })
