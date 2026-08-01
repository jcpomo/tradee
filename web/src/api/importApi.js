import { API_BASE, getAccessToken, apiFetch } from './client'
export async function preview(accountId, file) {
  const fd = new FormData(); fd.append('file', file)
  const res = await fetch(`${API_BASE}/api/import/preview?accountId=${accountId}`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: fd })
  if (!res.ok) { let p = {}; try { p = await res.json() } catch { /* */ } throw new Error(p.message || `HTTP ${res.status}`) }
  return res.json()
}
export const commit = (accountId, opts) => apiFetch(`/api/import/commit?accountId=${accountId}`, { method: 'POST', body: opts })
export const listBatches = (accountId) => apiFetch(`/api/import/batches?accountId=${accountId}`)
export const undoBatch = (id) => apiFetch(`/api/import/batches/${id}`, { method: 'DELETE' })
