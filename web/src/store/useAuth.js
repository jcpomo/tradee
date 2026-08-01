import { create } from 'zustand'
import { apiFetch, setAccessToken, API_BASE } from '../api/client'
export const useAuth = create((set) => ({
  user: null, status: 'loading', activeAccountId: null,
  async bootstrap() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('no session')
      setAccessToken((await res.json()).accessToken)
      const me = await apiFetch('/auth/me')
      set({ user: me.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
    } catch { set({ user: null, status: 'anonymous' }) }
  },
  async login(email, password) {
    const d = await apiFetch('/auth/login', { method: 'POST', auth: false, body: { email, password } })
    setAccessToken(d.accessToken)
    const me = await apiFetch('/auth/me')
    set({ user: d.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
  },
  async register(email, password) {
    const d = await apiFetch('/auth/register', { method: 'POST', auth: false, body: { email, password } })
    setAccessToken(d.accessToken)
    const me = await apiFetch('/auth/me')
    set({ user: d.user, activeAccountId: me.activeAccountId, status: 'authenticated' })
  },
  setActiveAccountId(id) { set({ activeAccountId: id }) },
  async logout() { try { await apiFetch('/auth/logout', { method: 'POST' }) } catch { /* */ } setAccessToken(null); set({ user: null, status: 'anonymous' }) },
}))
