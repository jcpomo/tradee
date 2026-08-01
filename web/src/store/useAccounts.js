import { create } from 'zustand'
import * as api from '../api/endpoints'
import { useAuth } from './useAuth'
import { useStore } from './useStore'

export const useAccounts = create((set, get) => ({
  accounts: [],
  activeId: null,

  async load() {
    const { accounts, activeAccountId } = await api.listAccounts()
    set({ accounts, activeId: activeAccountId })
  },

  async activate(id) {
    await api.activateAccount(id)
    useAuth.getState().setActiveAccountId(id)
    set({ activeId: id })
    useStore.getState().resetForAccountSwitch()
    await useStore.getState().hydrate(id)
  },

  async create(payload) {
    const { account } = await api.createAccount(payload)
    await get().load()
    return account
  },

  async remove(id) {
    await api.deleteAccount(id)
    await get().load()
  },
}))
