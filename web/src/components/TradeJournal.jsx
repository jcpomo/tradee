import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { useAccount } from '../store/useAccount'
import { Section, Field, Badge, EmptyState, NoteBox } from './ui'
import { CALC_INSTRUMENTS, INSTRUMENTS } from '../data/instruments'
import {
  todayISO,
  nowTime,
  fmtUSD,
  fmtSignedUSD,
  fmtPct,
  fmtDate,
  sumPnL,
  winRate,
  pnlFromPoints,
} from '../utils/calculations'
import { downloadFile } from '../utils/storage'

const RESULTS = [
  { value: 'WIN', label: 'WIN', cls: 'border-win bg-win/15 text-win' },
  { value: 'LOSS', label: 'LOSS', cls: 'border-loss bg-loss/15 text-loss' },
  { value: 'BE', label: 'BE', cls: 'border-slate-500 bg-slate-500/15 text-slate-300' },
]

const emptyForm = (settings) => ({
  date: todayISO(),
  time: nowTime(),
  instrument: settings.defaultInstrument,
  direction: 'LONG',
  contracts: settings.defaultContracts,
  result: 'WIN',
  pnl: '',
  points: '',
  strategy: '',
  notes: '',
})

export default function TradeJournal() {
  const a = useAccount()
  const trades = useStore((s) => s.trades)
  const addTrade = useStore((s) => s.addTrade)
  const deleteTrade = useStore((s) => s.deleteTrade)
  const setBalance = useStore((s) => s.setBalance)

  const [form, setForm] = useState(() => emptyForm(a.settings))
  const [applyToBalance, setApplyToBalance] = useState(true)
  const [openDays, setOpenDays] = useState({})

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const today = a.today
  const stats = a.dayStats

  // Días anteriores, más reciente primero
  const previousDays = useMemo(() => {
    const byDay = new Map()
    trades.forEach((t) => {
      if (t.date === today) return
      if (!byDay.has(t.date)) byDay.set(t.date, [])
      byDay.get(t.date).push(t)
    })
    return [...byDay.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .map(([date, list]) => ({
        date,
        list: [...list].sort((p, q) => (p.time || '').localeCompare(q.time || '')),
        pnl: sumPnL(list),
        winRate: winRate(list),
        wins: list.filter((t) => t.result === 'WIN').length,
        losses: list.filter((t) => t.result === 'LOSS').length,
      }))
  }, [trades, today])

  // Autocalcular el P&L a partir de los puntos si el usuario los introduce
  const pnlFromPointsValue = useMemo(() => {
    const pts = parseFloat(form.points)
    if (!Number.isFinite(pts)) return null
    const sign = form.result === 'LOSS' ? -1 : form.result === 'BE' ? 0 : 1
    return pnlFromPoints(form.contracts, Math.abs(pts) * sign, form.instrument)
  }, [form.points, form.result, form.contracts, form.instrument])

  const resolvedPnL = useMemo(() => {
    if (form.result === 'BE') return 0
    const manual = parseFloat(form.pnl)
    if (Number.isFinite(manual)) return form.result === 'LOSS' ? -Math.abs(manual) : Math.abs(manual)
    if (pnlFromPointsValue !== null) return pnlFromPointsValue
    return null
  }, [form.pnl, form.result, pnlFromPointsValue])

  const canSubmit = resolvedPnL !== null

  const submit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    addTrade({
      date: form.date,
      time: form.time,
      instrument: form.instrument,
      direction: form.direction,
      contracts: Number(form.contracts),
      result: form.result,
      pnl: resolvedPnL,
      points: form.points === '' ? null : Number(form.points),
      strategy: form.strategy.trim(),
      notes: form.notes.trim(),
    })
    if (applyToBalance && form.date === today) setBalance(a.currentBalance + resolvedPnL)
    setForm({ ...emptyForm(a.settings), strategy: form.strategy })
  }

  const exportCSV = () => {
    const header = ['Fecha', 'Hora', 'Instrumento', 'Direccion', 'Contratos', 'Resultado', 'PnL', 'Puntos', 'Estrategia', 'Notas']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [...trades]
      .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))
      .map((t) =>
        [t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.points ?? '', t.strategy, t.notes]
          .map(esc)
          .join(','),
      )
    downloadFile(`apex-trades-${todayISO()}.csv`, [header.map(esc).join(','), ...rows].join('\n'), 'text/csv;charset=utf-8')
  }

  const blocked = stats.consecutiveLosses >= 3 || stats.dailyRemaining <= 0 || stats.count >= a.settings.maxTradesPerDay

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <Section
        title="Registrar trade"
        subtitle="Rellena el P&L en $ o los puntos de resultado — la app calcula el otro"
        right={<Badge tone={blocked ? 'red' : 'green'}>{blocked ? 'Deberías parar' : 'Puedes operar'}</Badge>}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Fecha">
              <input type="date" className="input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Hora">
              <input type="time" className="input" value={form.time} onChange={(e) => set({ time: e.target.value })} />
            </Field>
            <Field label="Instrumento">
              <select className="input" value={form.instrument} onChange={(e) => set({ instrument: e.target.value })}>
                {CALC_INSTRUMENTS.map((k) => (
                  <option key={k} value={k}>
                    {k} — {INSTRUMENTS[k].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contratos">
              <select
                className="input tnum"
                value={form.contracts}
                onChange={(e) => set({ contracts: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Dirección">
              <div className="grid grid-cols-2 gap-1.5">
                {['LONG', 'SHORT'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set({ direction: d })}
                    className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                      form.direction === d
                        ? d === 'LONG'
                          ? 'border-win bg-win/15 text-win'
                          : 'border-loss bg-loss/15 text-loss'
                        : 'border-border bg-panel2 text-slate-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Resultado">
              <div className="grid grid-cols-3 gap-1.5">
                {RESULTS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set({ result: r.value })}
                    className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                      form.result === r.value ? r.cls : 'border-border bg-panel2 text-slate-400'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="P&L ($)"
              hint={form.result === 'LOSS' ? 'Se guarda en negativo automáticamente' : form.result === 'BE' ? 'BE = $0' : null}
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                className="input tnum font-semibold"
                placeholder={pnlFromPointsValue !== null ? String(Math.abs(pnlFromPointsValue)) : '0.00'}
                value={form.result === 'BE' ? '' : form.pnl}
                disabled={form.result === 'BE'}
                onChange={(e) => set({ pnl: e.target.value })}
              />
            </Field>

            <Field label="Puntos" hint={pnlFromPointsValue !== null ? `= ${fmtSignedUSD(pnlFromPointsValue, 2)}` : 'Opcional'}>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                className="input tnum"
                placeholder="0.00"
                value={form.points}
                onChange={(e) => set({ points: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estrategia">
              <input
                className="input"
                placeholder="ORB, FVG, AMD, breakout…"
                value={form.strategy}
                onChange={(e) => set({ strategy: e.target.value })}
              />
            </Field>
            <Field label="Notas">
              <input
                className="input"
                placeholder="Qué pasó, qué harías distinto…"
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#F0B429]"
                checked={applyToBalance}
                onChange={(e) => setApplyToBalance(e.target.checked)}
              />
              Aplicar el P&L al balance actual ({fmtUSD(a.currentBalance)} →{' '}
              {fmtUSD(a.currentBalance + (resolvedPnL ?? 0))})
            </label>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              Añadir trade
            </button>
          </div>

          {blocked && (
            <NoteBox tone="red">
              Tu plan dice que hoy ya no operas: {stats.consecutiveLosses >= 3 && '3 pérdidas seguidas. '}
              {stats.dailyRemaining <= 0 && 'stop diario agotado. '}
              {stats.count >= a.settings.maxTradesPerDay && `máximo de ${a.settings.maxTradesPerDay} trades alcanzado. `}
              Puedes seguir registrando lo que ya ocurrió, pero no abras nada nuevo.
            </NoteBox>
          )}
        </form>
      </Section>

      {/* Estadísticas del día */}
      <Section
        title={`Hoy — ${fmtDate(today)}`}
        right={
          <span className={`text-2xl font-bold tnum ${stats.pnl > 0 ? 'text-win' : stats.pnl < 0 ? 'text-loss' : 'text-slate-300'}`}>
            {fmtSignedUSD(stats.pnl)}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { l: 'Trades', v: `${stats.count} / ${a.settings.maxTradesPerDay}`, tone: stats.count >= a.settings.maxTradesPerDay ? 'text-loss' : 'text-slate-100' },
            { l: 'Win rate', v: fmtPct(stats.winRate, 0), tone: stats.winRate >= 50 ? 'text-win' : 'text-gold' },
            { l: 'W / L / BE', v: `${stats.wins} / ${stats.losses} / ${stats.be}`, tone: 'text-slate-100' },
            { l: 'Pérdidas seguidas', v: stats.consecutiveLosses, tone: stats.consecutiveLosses >= 3 ? 'text-loss' : stats.consecutiveLosses === 2 ? 'text-gold' : 'text-slate-100' },
            { l: 'Stop diario restante', v: fmtUSD(stats.dailyRemaining), tone: stats.dailyRemaining <= 0 ? 'text-loss' : 'text-slate-100' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-border bg-panel2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{s.l}</p>
              <p className={`mt-1 text-lg font-bold tnum ${s.tone}`}>{s.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          {stats.trades.length === 0 ? (
            <EmptyState icon="≡" title="Sin trades registrados hoy" subtitle="El primero se añade con el formulario de arriba" />
          ) : (
            <TradeTable trades={stats.trades} onDelete={deleteTrade} />
          )}
        </div>
      </Section>

      {/* Historial */}
      <Section
        title="Historial de días anteriores"
        subtitle={`${previousDays.length} día${previousDays.length === 1 ? '' : 's'} registrado${previousDays.length === 1 ? '' : 's'}`}
        right={
          <button className="btn-ghost" onClick={exportCSV} disabled={trades.length === 0}>
            Exportar CSV
          </button>
        }
      >
        {previousDays.length === 0 ? (
          <EmptyState icon="⌛" title="Todavía no hay historial" subtitle="Los días pasados aparecerán aquí como acordeón" />
        ) : (
          <div className="space-y-2">
            {previousDays.map((d) => {
              const open = openDays[d.date]
              return (
                <div key={d.date} className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setOpenDays((o) => ({ ...o, [d.date]: !o[d.date] }))}
                    className="flex w-full items-center justify-between gap-3 bg-panel2 px-3 py-2.5 text-left hover:bg-panel2/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted text-xs">{open ? '▾' : '▸'}</span>
                      <span className="text-sm font-semibold text-slate-100">{fmtDate(d.date)}</span>
                      <span className="text-xs text-muted tnum hidden sm:inline">
                        {d.list.length} trades · {d.wins}W/{d.losses}L · {fmtPct(d.winRate, 0)}
                      </span>
                    </div>
                    <span className={`text-sm font-bold tnum ${d.pnl > 0 ? 'text-win' : d.pnl < 0 ? 'text-loss' : 'text-slate-300'}`}>
                      {fmtSignedUSD(d.pnl)}
                    </span>
                  </button>
                  {open && (
                    <div className="p-3 border-t border-border">
                      <TradeTable trades={d.list} onDelete={deleteTrade} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Estadísticas globales */}
      <Section title="Estadísticas globales" subtitle="Todo el histórico registrado en este navegador">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: 'Trades totales', v: a.global.totalTrades, tone: 'text-slate-100' },
            { l: 'Win rate total', v: fmtPct(a.global.winRate, 1), tone: a.global.winRate >= 50 ? 'text-win' : 'text-gold' },
            { l: 'P&L acumulado', v: fmtSignedUSD(a.global.pnl), tone: a.global.pnl >= 0 ? 'text-win' : 'text-loss' },
            { l: 'W / L / BE', v: `${a.global.wins} / ${a.global.losses} / ${a.global.be}`, tone: 'text-slate-100' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-border bg-panel2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{s.l}</p>
              <p className={`mt-1 text-xl font-bold tnum ${s.tone}`}>{s.v}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function TradeTable({ trades, onDelete }) {
  let running = 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border">
            {['Hora', 'Instr.', 'Dir.', 'Cont.', 'Result.', 'P&L', 'Acumulado', 'Estrategia', 'Notas', ''].map((c) => (
              <th key={c} className="px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            running += t.pnl
            const rowTone =
              t.result === 'WIN' ? 'bg-win/[0.06]' : t.result === 'LOSS' ? 'bg-loss/[0.06]' : 'bg-slate-500/[0.05]'
            const pnlTone = t.pnl > 0 ? 'text-win' : t.pnl < 0 ? 'text-loss' : 'text-slate-400'
            return (
              <tr key={t.id} className={`border-b border-border/50 last:border-0 ${rowTone}`}>
                <td className="px-2.5 py-2 tnum text-slate-300 whitespace-nowrap">{t.time}</td>
                <td className="px-2.5 py-2 font-semibold text-slate-100 whitespace-nowrap">{t.instrument}</td>
                <td className={`px-2.5 py-2 font-semibold whitespace-nowrap ${t.direction === 'LONG' ? 'text-win' : 'text-loss'}`}>
                  {t.direction}
                </td>
                <td className="px-2.5 py-2 tnum text-slate-300">{t.contracts}</td>
                <td className="px-2.5 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      t.result === 'WIN'
                        ? 'bg-win/20 text-win'
                        : t.result === 'LOSS'
                          ? 'bg-loss/20 text-loss'
                          : 'bg-slate-500/20 text-slate-300'
                    }`}
                  >
                    {t.result}
                  </span>
                </td>
                <td className={`px-2.5 py-2 font-bold tnum whitespace-nowrap ${pnlTone}`}>{fmtSignedUSD(t.pnl, 2)}</td>
                <td className={`px-2.5 py-2 tnum whitespace-nowrap ${running >= 0 ? 'text-win/80' : 'text-loss/80'}`}>
                  {fmtSignedUSD(running, 2)}
                </td>
                <td className="px-2.5 py-2 text-slate-400 max-w-[10rem] truncate">{t.strategy || '—'}</td>
                <td className="px-2.5 py-2 text-slate-400 max-w-[14rem] truncate" title={t.notes}>
                  {t.notes || '—'}
                </td>
                <td className="px-2.5 py-2">
                  <button
                    onClick={() => onDelete(t.id)}
                    className="text-xs text-slate-600 hover:text-loss transition-colors"
                    title="Eliminar trade"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
