import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useAccount } from '../store/useAccount'
import AlertBanner from './AlertBanner'
import { Section, MetricCard, Field, ProgressBar, Badge, NoteBox } from './ui'
import { fmtUSD, fmtSignedUSD, fmtPct, fmtDate } from '../utils/calculations'
import { TRAILING_RULE } from '../data/apexRules'

export default function Dashboard({ onNavigate }) {
  const a = useAccount()
  const setBalance = useStore((s) => s.setBalance)
  const setPeakBalance = useStore((s) => s.setPeakBalance)
  const updateSettings = useStore((s) => s.updateSettings)

  // Los inputs se editan como texto para que se pueda borrar el campo mientras se escribe
  const [balanceDraft, setBalanceDraft] = useState(String(a.currentBalance))
  const [peakDraft, setPeakDraft] = useState(String(a.peakBalance))

  useEffect(() => setBalanceDraft(String(a.currentBalance)), [a.currentBalance])
  useEffect(() => setPeakDraft(String(a.peakBalance)), [a.peakBalance])

  const commitBalance = () => {
    const v = parseFloat(balanceDraft)
    if (Number.isFinite(v)) setBalance(v)
    else setBalanceDraft(String(a.currentBalance))
  }

  const commitPeak = () => {
    const v = parseFloat(peakDraft)
    if (Number.isFinite(v)) setPeakBalance(v)
    else setPeakDraft(String(a.peakBalance))
  }

  const quickAdjust = (delta) => setBalance(a.currentBalance + delta)

  const progressTone = a.progress >= 100 ? 'green' : a.progress >= 50 ? 'green' : a.progress > 0 ? 'yellow' : 'red'

  return (
    <div className="space-y-4">
      <AlertBanner />

      {/* Inputs del usuario */}
      <Section
        title="Estado de la cuenta"
        subtitle="Introduce los valores que ves en Apex antes de empezar la sesión"
        right={<Badge tone={a.floorProtected ? 'green' : 'blue'}>{a.floorProtected ? 'Suelo protegido' : a.settings.accountType}</Badge>}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Balance actual ($)" hint="Actualízalo cuando quieras — todo se recalcula al momento">
            <input
              type="number"
              inputMode="decimal"
              className="input text-lg font-bold tnum"
              value={balanceDraft}
              onChange={(e) => setBalanceDraft(e.target.value)}
              onBlur={commitBalance}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </Field>

          <Field label="Peak Balance ($)" hint="Se autoguarda si el balance actual lo supera">
            <input
              type="number"
              inputMode="decimal"
              className="input text-lg font-bold tnum"
              value={peakDraft}
              onChange={(e) => setPeakDraft(e.target.value)}
              onBlur={commitPeak}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </Field>

          <Field label="Inicio de la evaluación" hint={`${fmtDate(a.settings.startDate)} · ${a.settings.evalDays} días de plazo`}>
            <input
              type="date"
              className="input"
              value={a.settings.startDate}
              onChange={(e) => updateSettings({ startDate: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted mr-1">Ajuste rápido</span>
          {[-200, -100, -50, +50, +100, +200].map((d) => (
            <button
              key={d}
              onClick={() => quickAdjust(d)}
              className={`rounded-md border px-2.5 py-1 text-xs font-bold tnum transition-colors ${
                d < 0
                  ? 'border-loss/40 text-loss hover:bg-loss/15'
                  : 'border-win/40 text-win hover:bg-win/15'
              }`}
            >
              {d > 0 ? '+' : ''}
              {d}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <NoteBox tone="yellow">{TRAILING_RULE}</NoteBox>
        </div>
      </Section>

      {/* Las 8 tarjetas de métricas */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Suelo actual"
          value={fmtUSD(a.floor)}
          sub={`Peak ${fmtUSD(a.peakBalance)} − ${fmtUSD(a.settings.maxDrawdown)}`}
          tone={a.tones.floorTone}
          hint={a.tones.floorTone === 'red' ? 'Muy cerca del suelo' : null}
        />
        <MetricCard
          label="Margen disponible"
          value={fmtUSD(a.margin)}
          sub={`Balance ${fmtUSD(a.currentBalance)} − suelo`}
          tone={a.tones.marginTone}
          hint={a.margin < 200 ? 'Crítico' : a.margin < 500 ? 'Precaución' : null}
        />
        <MetricCard
          label="Beneficio acumulado"
          value={fmtSignedUSD(a.profit)}
          sub={`Sobre ${fmtUSD(a.settings.initialBalance)} iniciales`}
          tone={a.tones.profitTone}
        />
        <MetricCard
          label="Trades hasta el suelo"
          value={a.tradesLeft}
          sub={`A ${fmtUSD(a.settings.riskPerTrade)} de riesgo por trade`}
          tone={a.tones.tradesLeftTone}
          hint={a.tradesLeft < 3 ? 'Menos de 3 balas' : null}
        />
        <MetricCard
          label="Días restantes"
          value={a.daysLeft}
          sub={`De ${a.settings.evalDays} días de evaluación`}
          tone={a.tones.daysTone}
          hint={a.daysLeft < 5 ? 'Se acaba el plazo' : null}
        />
        <MetricCard
          label="Stop diario restante"
          value={fmtUSD(a.dayStats.dailyRemaining)}
          sub={`Perdido hoy ${fmtUSD(a.dayStats.lossesUSD)} de ${fmtUSD(a.settings.dailyStopLimit)}`}
          tone={a.tones.dailyTone}
          hint={a.dayStats.dailyRemaining <= 0 ? 'Agotado — cierra la plataforma' : null}
        />
        <MetricCard
          label="Pérdidas consecutivas"
          value={a.dayStats.consecutiveLosses}
          sub={`${a.dayStats.count} trade${a.dayStats.count === 1 ? '' : 's'} hoy · ${fmtPct(a.dayStats.winRate, 0)} win rate`}
          tone={a.tones.streakTone}
          hint={a.dayStats.consecutiveLosses >= 3 ? 'PARA EL DÍA' : null}
        />
        <MetricCard
          label="P&L de hoy"
          value={fmtSignedUSD(a.dayStats.pnl)}
          sub={`${a.dayStats.wins}W · ${a.dayStats.losses}L · ${a.dayStats.be}BE`}
          tone={a.dayStats.pnl > 0 ? 'green' : a.dayStats.pnl < 0 ? 'red' : 'neutral'}
        />
      </div>

      {/* Progreso hacia el objetivo */}
      <Section
        title="Progreso hacia el objetivo"
        subtitle={`Objetivo ${fmtUSD(a.targetBalance)} — ${fmtUSD(a.settings.profitTarget)} de beneficio en ${a.settings.evalDays} días`}
        right={<span className={`text-2xl font-bold tnum ${a.progress >= 0 ? 'text-win' : 'text-loss'}`}>{fmtPct(a.progress)}</span>}
      >
        <ProgressBar value={a.progress} tone={progressTone} height="h-4" />
        <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted tnum">
          <span>{fmtUSD(a.settings.initialBalance)}</span>
          <span className="text-loss">Suelo {fmtUSD(a.floor)}</span>
          <span className="text-win">{fmtUSD(a.targetBalance)}</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-panel2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Falta para el objetivo</p>
            <p className="mt-1 text-lg font-bold tnum text-slate-100">
              {fmtUSD(Math.max(0, a.targetBalance - a.currentBalance))}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-panel2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Trades ganadores necesarios</p>
            <p className="mt-1 text-lg font-bold tnum text-slate-100">
              {a.settings.riskPerTrade * a.settings.minRR > 0
                ? Math.ceil(
                    Math.max(0, a.targetBalance - a.currentBalance) /
                      (a.settings.riskPerTrade * a.settings.minRR),
                  )
                : '—'}
            </p>
            <p className="text-[11px] text-muted mt-0.5">
              A {fmtUSD(a.settings.riskPerTrade * a.settings.minRR)} por trade (R:R 1:{a.settings.minRR})
            </p>
          </div>
          <div className="rounded-lg border border-border bg-panel2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Ritmo necesario / día</p>
            <p className="mt-1 text-lg font-bold tnum text-slate-100">
              {a.daysLeft > 0
                ? fmtUSD(Math.max(0, a.targetBalance - a.currentBalance) / a.daysLeft)
                : '—'}
            </p>
            <p className="text-[11px] text-muted mt-0.5">Con {a.daysLeft} días restantes</p>
          </div>
        </div>
      </Section>

      {/* Accesos rápidos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => onNavigate('calculator')} className="card p-4 text-left hover:border-gold/50 transition-colors">
          <p className="text-sm font-bold text-slate-100">⊞ Calcular un trade</p>
          <p className="mt-1 text-xs text-muted">Riesgo exacto y texto del Bracket Order para Wealthcharts</p>
        </button>
        <button onClick={() => onNavigate('journal')} className="card p-4 text-left hover:border-gold/50 transition-colors">
          <p className="text-sm font-bold text-slate-100">≡ Registrar trade</p>
          <p className="mt-1 text-xs text-muted">
            {a.dayStats.count} de {a.settings.maxTradesPerDay} trades registrados hoy
          </p>
        </button>
        <button onClick={() => onNavigate('reference')} className="card p-4 text-left hover:border-gold/50 transition-colors">
          <p className="text-sm font-bold text-slate-100">☰ Checklist pre-trade</p>
          <p className="mt-1 text-xs text-muted">Las 8 preguntas antes de cada operación</p>
        </button>
      </div>
    </div>
  )
}
