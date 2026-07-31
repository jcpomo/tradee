import { useState, useMemo } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { useStore } from '../store/useStore'
import { useAccount } from '../store/useAccount'
import { Section, Field, EmptyState, NoteBox, Badge } from './ui'
import { todayISO, fmtUSD, fmtSignedUSD, fmtDate, sumPnL, tradesOfDay } from '../utils/calculations'

export default function FloorTracker() {
  const a = useAccount()
  const records = useStore((s) => s.dailyRecords)
  const addDailyRecord = useStore((s) => s.addDailyRecord)
  const deleteDailyRecord = useStore((s) => s.deleteDailyRecord)
  const trades = useStore((s) => s.trades)

  const [form, setForm] = useState({ date: todayISO(), open: '', close: '', note: '' })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Serie con el peak arrastrado día a día — el suelo del día siguiente sale de aquí
  const series = useMemo(() => {
    const sorted = [...records].sort((x, y) => x.date.localeCompare(y.date))
    let peak = a.settings.initialBalance
    return sorted.map((r) => {
      const open = Number(r.open)
      const close = Number(r.close)
      const dayPeak = Math.max(peak, Number.isFinite(close) ? close : 0, Number.isFinite(open) ? open : 0)
      peak = dayPeak
      const floorNext = dayPeak - a.settings.maxDrawdown
      const dayTrades = tradesOfDay(trades, r.date)
      return {
        ...r,
        open,
        close,
        peak: dayPeak,
        floorNext,
        margin: close - floorNext,
        pnl: Number.isFinite(open) && Number.isFinite(close) ? close - open : sumPnL(dayTrades),
        tradeCount: dayTrades.length,
        label: r.date.slice(5),
      }
    })
  }, [records, a.settings.initialBalance, a.settings.maxDrawdown, trades])

  // Datos del gráfico: los registros + el estado de hoy al final
  const chartData = useMemo(() => {
    const base = series.map((r) => ({
      label: r.label,
      balance: r.close,
      floor: r.floorNext,
      target: a.targetBalance,
      band: [r.floorNext, r.close],
    }))
    base.push({
      label: 'Ahora',
      balance: a.currentBalance,
      floor: a.floor,
      target: a.targetBalance,
      band: [a.floor, a.currentBalance],
    })
    return base
  }, [series, a.currentBalance, a.floor, a.targetBalance])

  const submit = (e) => {
    e.preventDefault()
    const open = parseFloat(form.open)
    const close = parseFloat(form.close)
    if (!Number.isFinite(close)) return
    addDailyRecord({
      date: form.date,
      open: Number.isFinite(open) ? open : close,
      close,
      note: form.note.trim(),
    })
    setForm({ date: todayISO(), open: '', close: '', note: '' })
  }

  const fillToday = () => {
    const dayPnL = a.dayStats.pnl
    set({ date: a.today, open: String(a.currentBalance - dayPnL), close: String(a.currentBalance) })
  }

  const yDomain = useMemo(() => {
    const values = chartData.flatMap((d) => [d.balance, d.floor, d.target]).filter(Number.isFinite)
    if (values.length === 0) return ['auto', 'auto']
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max(200, (max - min) * 0.1)
    return [Math.floor((min - pad) / 100) * 100, Math.ceil((max + pad) / 100) * 100]
  }, [chartData])

  return (
    <div className="space-y-4">
      <Section
        title="Registrar el día"
        subtitle="El suelo del día siguiente se calcula solo al introducir el balance de cierre"
        right={<Badge tone="blue">{series.length} días</Badge>}
      >
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label="Fecha">
            <input type="date" className="input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Balance apertura">
            <input
              type="number"
              inputMode="decimal"
              className="input tnum"
              placeholder="50000"
              value={form.open}
              onChange={(e) => set({ open: e.target.value })}
            />
          </Field>
          <Field label="Balance cierre">
            <input
              type="number"
              inputMode="decimal"
              className="input tnum font-semibold"
              placeholder="50200"
              value={form.close}
              onChange={(e) => set({ close: e.target.value })}
            />
          </Field>
          <Field label="Nota">
            <input
              className="input"
              placeholder="Opcional"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={!form.close}>
              Guardar
            </button>
            <button type="button" className="btn-ghost" onClick={fillToday} title="Rellenar con el estado de hoy">
              Hoy
            </button>
          </div>
        </form>

        <div className="mt-4">
          <NoteBox tone="yellow">
            Si el balance de cierre supera el peak histórico, el suelo sube y ya no baja nunca. Es la parte del trailing
            drawdown que juega a tu favor: cada día verde eleva el suelo de forma permanente.
          </NoteBox>
        </div>
      </Section>

      {/* Gráfico */}
      <Section
        title="Balance vs Suelo vs Objetivo"
        subtitle={`Suelo ${fmtUSD(a.floor)} · Balance ${fmtUSD(a.currentBalance)} · Objetivo ${fmtUSD(a.targetBalance)}`}
      >
        <div className="h-72 sm:h-80 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00C853" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#00C853" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2A3441" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#8B98A5" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#2A3441' }} />
              <YAxis
                domain={yDomain}
                stroke="#8B98A5"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2A3441' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: '#161B22',
                  border: '1px solid #2A3441',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#8B98A5', fontWeight: 600 }}
                formatter={(value, name) => {
                  if (Array.isArray(value)) return [`${fmtUSD(value[0])} → ${fmtUSD(value[1])}`, 'Margen']
                  return [fmtUSD(value), name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area
                dataKey="band"
                name="Margen"
                stroke="none"
                fill="url(#bandFill)"
                isAnimationActive={false}
                legendType="none"
              />
              <ReferenceLine
                y={a.settings.initialBalance}
                stroke="#4FC3F7"
                strokeDasharray="4 4"
                label={{ value: 'Inicial', fill: '#4FC3F7', fontSize: 10, position: 'insideTopLeft' }}
              />
              <Line type="monotone" dataKey="target" name="Objetivo" stroke="#00C853" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              <Line type="monotone" dataKey="floor" name="Suelo" stroke="#FF1744" strokeWidth={2.5} dot={{ r: 2, fill: '#FF1744' }} />
              <Line type="monotone" dataKey="balance" name="Balance" stroke="#F0B429" strokeWidth={2.5} dot={{ r: 3, fill: '#F0B429' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Tabla de seguimiento */}
      <Section title="Seguimiento diario" subtitle="Peak arrastrado y suelo resultante para el día siguiente">
        {series.length === 0 ? (
          <EmptyState icon="⌷" title="Sin días registrados" subtitle="Añade el cierre de la jornada con el formulario de arriba" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Día', 'Apertura', 'Cierre', 'P&L', 'Peak', 'Suelo día siguiente', 'Margen', 'Trades', 'Nota', ''].map((c) => (
                    <th key={c} className="px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border/50 last:border-0 ${
                      r.pnl > 0 ? 'bg-win/[0.06]' : r.pnl < 0 ? 'bg-loss/[0.06]' : ''
                    }`}
                  >
                    <td className="px-2.5 py-2 font-semibold text-slate-100 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-2.5 py-2 tnum text-slate-300">{fmtUSD(r.open)}</td>
                    <td className="px-2.5 py-2 tnum font-semibold text-slate-100">{fmtUSD(r.close)}</td>
                    <td className={`px-2.5 py-2 tnum font-bold ${r.pnl > 0 ? 'text-win' : r.pnl < 0 ? 'text-loss' : 'text-slate-400'}`}>
                      {fmtSignedUSD(r.pnl)}
                    </td>
                    <td className="px-2.5 py-2 tnum text-gold">{fmtUSD(r.peak)}</td>
                    <td className="px-2.5 py-2 tnum font-semibold text-loss">{fmtUSD(r.floorNext)}</td>
                    <td
                      className={`px-2.5 py-2 tnum font-semibold ${
                        r.margin < 300 ? 'text-loss' : r.margin < 800 ? 'text-gold' : 'text-win'
                      }`}
                    >
                      {fmtUSD(r.margin)}
                    </td>
                    <td className="px-2.5 py-2 tnum text-slate-400">{r.tradeCount}</td>
                    <td className="px-2.5 py-2 text-slate-400 max-w-[14rem] truncate" title={r.note}>
                      {r.note || '—'}
                    </td>
                    <td className="px-2.5 py-2">
                      <button
                        onClick={() => deleteDailyRecord(r.id)}
                        className="text-xs text-slate-600 hover:text-loss transition-colors"
                        title="Eliminar día"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
