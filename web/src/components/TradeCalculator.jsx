import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useAccount } from '../store/useAccount'
import { Section, Field, Badge, NoteBox, TONE } from './ui'
import { INSTRUMENTS, CALC_INSTRUMENTS } from '../data/instruments'
import { instrumentSummary, priceStep } from '../utils/instruments'
import { computeTrade, tradeSignal, fmtUSD, fmtNum } from '../utils/calculations'
import { copyToClipboard } from '../utils/storage'

const SIGNAL_COPY = {
  green: { title: 'VERDE — Puedes operar', tone: 'green' },
  yellow: { title: 'AMARILLO — Precaución', tone: 'yellow' },
  red: { title: 'ROJO — No operar', tone: 'red' },
}

export default function TradeCalculator({ onNavigate }) {
  const a = useAccount()
  const lastCalc = useStore((s) => s.lastCalc)
  const setLastCalc = useStore((s) => s.setLastCalc)

  const [instrument, setInstrument] = useState(lastCalc?.instrument || a.settings.defaultInstrument)
  const [contracts, setContracts] = useState(lastCalc?.contracts || a.settings.defaultContracts)
  const [direction, setDirection] = useState(lastCalc?.direction || 'LONG')
  const [entry, setEntry] = useState(lastCalc?.entry ?? '')
  const [stopLoss, setStopLoss] = useState(lastCalc?.stopLoss ?? '')
  const [takeProfit, setTakeProfit] = useState(lastCalc?.takeProfit ?? '')
  const [copied, setCopied] = useState(false)

  const inst = INSTRUMENTS[instrument]

  const calc = useMemo(
    () => computeTrade({ instrument, contracts, entry, stopLoss, takeProfit, direction }),
    [instrument, contracts, entry, stopLoss, takeProfit, direction],
  )

  const signal = useMemo(
    () =>
      tradeSignal({
        riskUSD: calc.riskUSD,
        rr: calc.rr,
        hasTP: calc.hasTP,
        riskPerTrade: a.settings.riskPerTrade,
        minRR: a.settings.minRR,
        marginAvailable: a.margin,
        dailyRemaining: a.dayStats.dailyRemaining,
        hasErrors: calc.errors.length > 0,
      }),
    [calc, a.settings.riskPerTrade, a.settings.minRR, a.margin, a.dayStats.dailyRemaining],
  )

  // Recordar el último cálculo para reabrir la pantalla donde se dejó
  useEffect(() => {
    setLastCalc({ instrument, contracts, direction, entry, stopLoss, takeProfit })
  }, [instrument, contracts, direction, entry, stopLoss, takeProfit, setLastCalc])

  const step = priceStep(instrument)

  // Sugerir el SL/TP que encaja exactamente con el plan de riesgo
  const suggested = useMemo(() => {
    const risk = a.settings.riskPerTrade
    const pv = inst.pointValue * Math.max(1, contracts)
    if (pv <= 0) return null
    const slPoints = risk / pv
    const slTicks = Math.round(slPoints * inst.ticksPerPt)
    return { slPoints, slTicks, tpTicks: Math.round(slTicks * a.settings.minRR), rewardUSD: risk * a.settings.minRR }
  }, [inst, contracts, a.settings.riskPerTrade, a.settings.minRR])

  const applySuggested = () => {
    const e = parseFloat(entry)
    if (!Number.isFinite(e) || !suggested) return
    const slPts = suggested.slPoints
    const tpPts = slPts * a.settings.minRR
    const round = (v) => Math.round(v / step) * step
    if (direction === 'LONG') {
      setStopLoss(String(round(e - slPts)))
      setTakeProfit(String(round(e + tpPts)))
    } else {
      setStopLoss(String(round(e + slPts)))
      setTakeProfit(String(round(e - tpPts)))
    }
  }

  const doCopy = async (text) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const clear = () => {
    setEntry('')
    setStopLoss('')
    setTakeProfit('')
  }

  const riskOver = calc.riskUSD > a.settings.riskPerTrade
  const rrUnder = calc.hasTP && calc.rr < a.settings.minRR
  const t = TONE[SIGNAL_COPY[signal.level].tone]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* ── Inputs ─────────────────────────────────────────── */}
        <Section title="Parámetros del trade" subtitle={instrumentSummary(instrument)}>
          <div className="space-y-4">
            <Field label="Instrumento">
              <div className="grid grid-cols-4 gap-1.5">
                {CALC_INSTRUMENTS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setInstrument(key)}
                    className={`rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
                      instrument === key
                        ? 'border-gold bg-gold/15 text-gold'
                        : 'border-border bg-panel2 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Dirección">
                <div className="grid grid-cols-2 gap-1.5">
                  {['LONG', 'SHORT'].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        direction === d
                          ? d === 'LONG'
                            ? 'border-win bg-win/15 text-win'
                            : 'border-loss bg-loss/15 text-loss'
                          : 'border-border bg-panel2 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {d === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Contratos" hint={`Máximo ${a.settings.accountType === 'PA' ? 6 : 6} en evaluación`}>
                <div className="grid grid-cols-6 gap-1">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setContracts(n)}
                      className={`rounded-lg border py-2.5 text-sm font-bold tnum transition-colors ${
                        contracts === n
                          ? 'border-gold bg-gold/15 text-gold'
                          : 'border-border bg-panel2 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Entrada">
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  className="input tnum font-semibold"
                  placeholder="0.00"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                />
              </Field>
              <Field label="Stop Loss">
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  className={`input tnum font-semibold ${riskOver ? 'border-loss/60' : ''}`}
                  placeholder="0.00"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                />
              </Field>
              <Field label="Take Profit">
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  className={`input tnum font-semibold ${rrUnder ? 'border-loss/60' : ''}`}
                  placeholder="0.00"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={applySuggested} disabled={!entry}>
                Aplicar SL/TP de mi plan
              </button>
              <button className="btn-ghost" onClick={clear}>
                Limpiar
              </button>
            </div>

            {suggested && (
              <NoteBox tone="blue">
                Para arriesgar exactamente {fmtUSD(a.settings.riskPerTrade)} con {contracts} {instrument}: SL de{' '}
                <b>{fmtNum(suggested.slPoints, 2)} puntos</b> ({suggested.slTicks} ticks) y TP de{' '}
                <b>{suggested.tpTicks} ticks</b> para un R:R 1:{a.settings.minRR} ={' '}
                {fmtUSD(suggested.rewardUSD)} de beneficio.
              </NoteBox>
            )}
          </div>
        </Section>

        {/* ── Resultados ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Semáforo */}
          <div className={`rounded-xl border p-4 ${t.border} ${t.bg}`}>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                {['green', 'yellow', 'red'].map((lv) => (
                  <span
                    key={lv}
                    className={`h-3 w-3 rounded-full transition-opacity ${
                      lv === 'green' ? 'bg-win' : lv === 'yellow' ? 'bg-gold' : 'bg-loss'
                    } ${signal.level === lv ? 'opacity-100' : 'opacity-20'}`}
                  />
                ))}
              </div>
              <div className="min-w-0">
                <p className={`text-base font-bold ${t.text}`}>{SIGNAL_COPY[signal.level].title}</p>
                <ul className="mt-1 space-y-0.5">
                  {signal.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-slate-300">
                      · {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <Section title="Cálculo del riesgo">
            {!calc.ready ? (
              <p className="py-6 text-center text-sm text-muted">
                Introduce la entrada y el stop loss para ver los números.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-panel2 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Distancia del SL</p>
                    <p className="mt-1 text-xl font-bold tnum text-slate-100">{fmtNum(calc.stopPoints, 2)} pts</p>
                    <p className="text-xs text-muted tnum">{calc.stopTicks} ticks</p>
                  </div>
                  <div className="rounded-lg border border-border bg-panel2 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Distancia del TP</p>
                    <p className="mt-1 text-xl font-bold tnum text-slate-100">
                      {calc.hasTP ? `${fmtNum(calc.targetPoints, 2)} pts` : '—'}
                    </p>
                    <p className="text-xs text-muted tnum">{calc.hasTP ? `${calc.targetTicks} ticks` : 'Sin TP'}</p>
                  </div>
                  <div
                    className={`rounded-lg border p-3 ${
                      riskOver ? 'border-loss/50 bg-loss/10' : 'border-border bg-panel2'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Riesgo total</p>
                    <p className={`mt-1 text-xl font-bold tnum ${riskOver ? 'text-loss' : 'text-slate-100'}`}>
                      {fmtUSD(calc.riskUSD, 2)}
                    </p>
                    <p className="text-xs text-muted">Límite {fmtUSD(a.settings.riskPerTrade)}</p>
                  </div>
                  <div
                    className={`rounded-lg border p-3 ${
                      rrUnder ? 'border-loss/50 bg-loss/10' : 'border-border bg-panel2'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Beneficio · R:R</p>
                    <p className={`mt-1 text-xl font-bold tnum ${rrUnder ? 'text-loss' : 'text-win'}`}>
                      {calc.hasTP ? fmtUSD(calc.rewardUSD, 2) : '—'}
                    </p>
                    <p className={`text-xs tnum ${rrUnder ? 'text-loss' : 'text-muted'}`}>
                      {calc.hasTP ? `R:R 1:${fmtNum(calc.rr, 2)} · mínimo 1:${a.settings.minRR}` : `Mínimo 1:${a.settings.minRR}`}
                    </p>
                  </div>
                </div>

                {calc.errors.length > 0 && (
                  <NoteBox tone="red">
                    {calc.errors.map((e, i) => (
                      <p key={i}>· {e}</p>
                    ))}
                  </NoteBox>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border bg-panel2 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted">% del drawdown</p>
                    <p className="text-sm font-bold tnum text-slate-200">
                      {fmtNum((calc.riskUSD / a.settings.maxDrawdown) * 100, 2)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-panel2 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted">% del margen</p>
                    <p className="text-sm font-bold tnum text-slate-200">
                      {a.margin > 0 ? `${fmtNum((calc.riskUSD / a.margin) * 100, 1)}%` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-panel2 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted">Trades como este</p>
                    <p className="text-sm font-bold tnum text-slate-200">
                      {calc.riskUSD > 0 ? Math.floor(a.margin / calc.riskUSD) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Bracket Order */}
          <Section
            title="Bracket Order para Wealthcharts"
            subtitle="Order Strategy → Simple"
            right={<Badge tone="blue">{instrument}</Badge>}
          >
            <div className="rounded-xl border-2 border-gold/50 bg-gold/10 p-4">
              <p className="text-center text-2xl font-bold tnum text-gold">
                {calc.ready ? calc.bracketText : 'TP: — ticks / SL: — ticks'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Take-profit (Ticks)</p>
                  <p className="text-lg font-bold tnum text-win">{calc.hasTP ? calc.targetTicks : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Stop-loss (Ticks)</p>
                  <p className="text-lg font-bold tnum text-loss">{calc.ready ? calc.stopTicks : '—'}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary flex-1" onClick={() => doCopy(calc.bracketText)} disabled={!calc.ready}>
                {copied ? '✓ Copiado' : 'COPIAR bracket'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => doCopy(String(calc.targetTicks))}
                disabled={!calc.hasTP}
              >
                Copiar TP
              </button>
              <button className="btn-ghost" onClick={() => doCopy(String(calc.stopTicks))} disabled={!calc.ready}>
                Copiar SL
              </button>
            </div>

            <p className="mt-3 text-[11px] text-muted">
              {inst.name} · ${inst.pointValue} por punto · ${inst.tickValue.toFixed(2)} por tick ·{' '}
              {inst.ticksPerPt} tick{inst.ticksPerPt > 1 ? 's' : ''} por punto
            </p>
          </Section>

          {signal.level !== 'red' && calc.ready && (
            <button className="btn-ghost w-full" onClick={() => onNavigate('journal')}>
              Ir al diario para registrar el resultado →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
