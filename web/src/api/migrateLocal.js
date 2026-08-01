import * as api from './endpoints'

const KEY = 'apex-dashboard-v1'

export function hasLegacyData() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null')
    return !!(d?.state?.trades?.length || d?.state?.dailyRecords?.length)
  } catch {
    return false
  }
}

export async function migrateLegacyData(accountId) {
  const d = JSON.parse(localStorage.getItem(KEY))
  const st = d.state || {}

  if (st.settings) await api.patchAccount(accountId, st.settings)
  if (st.currentBalance != null) await api.patchAccount(accountId, { currentBalance: st.currentBalance, peakBalance: st.peakBalance })

  for (const t of st.trades || []) {
    const { id, source, importBatchId, ...rest } = t
    await api.createTrade(accountId, rest)
  }

  for (const r of st.dailyRecords || []) {
    const { id, ...rest } = r
    await api.upsertDailyRecord(accountId, rest)
  }

  localStorage.removeItem(KEY)
}
