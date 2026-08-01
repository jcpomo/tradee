import { useEffect, useRef, useState } from 'react'
import { useAccounts } from '../store/useAccounts'
import { DRAWDOWN_MODES } from '../data/apexPresets'
import { fmtUSD } from '../utils/calculations'

const modeLabel = (mode) => DRAWDOWN_MODES.find((m) => m.value === mode)?.label ?? mode

export default function AccountSwitcher({ onNewAccount }) {
  const accounts = useAccounts((s) => s.accounts)
  const activeId = useAccounts((s) => s.activeId)
  const activate = useAccounts((s) => s.activate)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef(null)

  const active = accounts.find((a) => a.id === activeId)

  useEffect(() => {
    if (!open) return undefined
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const handleSelect = async (id) => {
    if (id === activeId) { setOpen(false); return }
    setSwitching(true)
    try {
      await activate(id)
    } finally {
      setSwitching(false)
      setOpen(false)
    }
  }

  const handleNewAccount = () => {
    setOpen(false)
    onNewAccount?.()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2 rounded-lg border border-border bg-panel2 px-3 py-1.5 text-left transition-colors hover:border-gold/50 disabled:opacity-60"
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-slate-100">
            {switching ? 'Cambiando…' : active?.name ?? 'Sin cuenta'}
          </p>
          {active && !switching && (
            <p className="truncate text-[10px] text-muted">
              {active.sizeLabel ?? fmtUSD(active.initialBalance)} · {modeLabel(active.drawdownMode)}
            </p>
          )}
        </div>
        <span className="text-[10px] text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-64 rounded-lg border border-border bg-panel shadow-lg overflow-hidden">
          <ul className="max-h-72 overflow-y-auto py-1">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(a.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-panel2 ${
                    a.id === activeId ? 'text-gold' : 'text-slate-200'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block truncate text-[10px] text-muted">
                      {a.sizeLabel ?? fmtUSD(a.initialBalance)} · {modeLabel(a.drawdownMode)}
                    </span>
                  </span>
                  {a.id === activeId && <span className="shrink-0 text-[10px]">✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border">
            <button
              type="button"
              onClick={handleNewAccount}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-gold hover:bg-panel2"
            >
              ➕ Nueva cuenta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
