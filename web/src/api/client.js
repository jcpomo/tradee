const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
let accessToken = null
export const setAccessToken = (t) => { accessToken = t }
export const getAccessToken = () => accessToken
export const API_BASE = API_URL

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
  return fetch(`${API_URL}${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined })
}
async function tryRefresh() {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!res.ok) return false
  accessToken = (await res.json()).accessToken
  return true
}
export async function apiFetch(path, opts = {}) {
  let res = await raw(path, opts)
  if (res.status === 401 && opts.auth !== false && (await tryRefresh())) res = await raw(path, opts)
  if (!res.ok) {
    let p = {}; try { p = await res.json() } catch { /* */ }
    const err = new Error(p.message || `HTTP ${res.status}`); err.status = res.status; err.code = p.error
    throw err
  }
  return res.status === 204 ? null : res.json()
}
