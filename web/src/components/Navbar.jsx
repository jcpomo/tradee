import { useAccount } from '../store/useAccount'
import { fmtUSD, fmtSignedUSD } from '../utils/calculations'

export const SCREENS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◧', short: 'Panel' },
  { id: 'calculator', label: 'Calculadora', icon: '⊞', short: 'Calc' },
  { id: 'journal', label: 'Diario', icon: '≡', short: 'Diario' },
  { id: 'floor', label: 'Suelo', icon: '⌷', short: 'Suelo' },
  { id: 'reference', label: 'Referencia', icon: '☰', short: 'Ref' },
  { id: 'settings', label: 'Configuración', icon: '⚙', short: 'Ajustes' },
]

export default function Navbar({ screen, onChange }) {
  const a = useAccount()
  const marginTone =
    a.margin < 300 ? 'text-loss' : a.margin < 800 ? 'text-gold' : 'text-win'

  return (
    <>
      {/* Cabecera */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 border border-gold/40">
                <span className="text-gold font-black text-sm">A</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-100 leading-tight truncate">APEX TRADER FUNDING</h1>
                <p className="text-[11px] text-muted truncate">
                  50K Intraday Trailing · {a.settings.accountType} · MNQ1
                </p>
              </div>
            </div>

            {/* Resumen siempre visible */}
            <div className="flex shrink-0 items-center gap-4 sm:gap-6">
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Balance</p>
                <p className="text-sm font-bold text-slate-100 tnum">{fmtUSD(a.currentBalance)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Suelo</p>
                <p className="text-sm font-bold text-loss tnum">{fmtUSD(a.floor)}</p>
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Margen</p>
                <p className={`text-sm font-bold tnum ${marginTone}`}>{fmtUSD(a.margin)}</p>
              </div>
              <div className="hidden md:block text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">P&L hoy</p>
                <p
                  className={`text-sm font-bold tnum ${
                    a.dayStats.pnl > 0 ? 'text-win' : a.dayStats.pnl < 0 ? 'text-loss' : 'text-slate-300'
                  }`}
                >
                  {fmtSignedUSD(a.dayStats.pnl)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pestañas — escritorio */}
        <nav className="hidden md:block border-t border-border/70">
          <div className="mx-auto max-w-7xl px-4">
            <div className="flex gap-1">
              {SCREENS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onChange(s.id)}
                  className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
                    screen === s.id ? 'text-gold' : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <span className="mr-1.5 opacity-70">{s.icon}</span>
                  {s.label}
                  {screen === s.id && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      {/* Pestañas — móvil, barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur md:hidden">
        <div className="flex">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                screen === s.id ? 'text-gold' : 'text-slate-500'
              }`}
            >
              <span className="text-base leading-none">{s.icon}</span>
              {s.short}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
