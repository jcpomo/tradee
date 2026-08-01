import { useState } from 'react'
import { useStore, DEFAULT_SETTINGS, SETTINGS_RANGES } from '../store/useStore'
import { useAccount } from '../store/useAccount'
import { Section, Field, NoteBox, Toggle } from './ui'
import { CALC_INSTRUMENTS, INSTRUMENTS } from '../data/instruments'
import { fmtUSD, todayISO } from '../utils/calculations'
import { API_BASE, getAccessToken } from '../api/client'

const RR_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5]
const DRAWDOWN_MODES = [
  { value: 'intraday', label: 'Intraday' },
  { value: 'eod', label: 'EOD' },
  { value: 'static', label: 'Static' },
]

export default function Settings() {
  const a = useAccount()
  const account = useStore((s) => s.account)
  const updateSettings = useStore((s) => s.updateSettings)
  const trades = useStore((s) => s.trades)
  const dailyRecords = useStore((s) => s.dailyRecords)
  const settings = a.settings

  const [msg, setMsg] = useState(null)

  const flash = (tone, text) => {
    setMsg({ tone, text })
    setTimeout(() => setMsg(null), 3500)
  }

  const numberField = (key, { min, max, step = 1 } = {}) => (
    <input
      type="number"
      inputMode="decimal"
      className="input tnum font-semibold"
      min={min}
      max={max}
      step={step}
      value={settings[key]}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        updateSettings({ [key]: Number.isFinite(v) ? v : 0 })
      }}
      onBlur={(e) => {
        let v = parseFloat(e.target.value)
        if (!Number.isFinite(v)) v = DEFAULT_SETTINGS[key]
        if (min != null) v = Math.max(min, v)
        if (max != null) v = Math.min(max, v)
        updateSettings({ [key]: v })
      }}
    />
  )

  const doExportCsv = async () => {
    try {
      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/api/trades/export.csv?accountId=${encodeURIComponent(account.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `apex-trades-${todayISO()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      flash('green', 'CSV descargado')
    } catch (err) {
      flash('red', `No se pudo exportar: ${err.message}`)
    }
  }

  const [riskMin, riskMax] = SETTINGS_RANGES.riskPerTrade
  const [dailyMin, dailyMax] = SETTINGS_RANGES.dailyStopLimit

  return (
    <div className="space-y-4">
      {msg && (
        <NoteBox tone={msg.tone === 'red' ? 'red' : 'green'}>{msg.text}</NoteBox>
      )}

      <Section title="Cuenta" subtitle="Parámetros de la evaluación Apex">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Balance inicial ($)">{numberField('initialBalance', { min: 1000, step: 1000 })}</Field>
          <Field label="Drawdown máximo ($)">{numberField('maxDrawdown', { min: 100, step: 100 })}</Field>
          <Field label="Objetivo de beneficio ($)">{numberField('profitTarget', { min: 100, step: 100 })}</Field>
          <Field label="Fecha inicio evaluación">
            <input
              type="date"
              className="input"
              value={settings.startDate}
              onChange={(e) => updateSettings({ startDate: e.target.value })}
            />
          </Field>
          <Field label="Días de plazo">{numberField('evalDays', { min: 1, max: 365 })}</Field>
          <Field label="Tipo de cuenta">
            <Toggle
              options={[
                { value: 'Evaluación', label: 'Evaluación' },
                { value: 'PA', label: 'PA (fondeada)' },
              ]}
              value={settings.accountType}
              onChange={(v) => updateSettings({ accountKind: v })}
            />
          </Field>
          <Field label="Modo de drawdown" hint="Cómo se calcula el suelo: en vivo, al cierre del día o fijo">
            <Toggle
              options={DRAWDOWN_MODES}
              value={account?.drawdownMode}
              onChange={(v) => updateSettings({ drawdownMode: v })}
              size="sm"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Suelo inicial', fmtUSD(settings.initialBalance - settings.maxDrawdown)],
            ['Objetivo final', fmtUSD(settings.initialBalance + settings.profitTarget)],
            ['Suelo actual', fmtUSD(a.floor)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-border bg-panel2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{l}</p>
              <p className="mt-1 text-lg font-bold tnum text-slate-100">{v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Plan de riesgo personal" subtitle="Apex no impone límite diario — este es el tuyo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Riesgo máximo por trade ($) — rango ${riskMin}–${riskMax}`}
            hint={`${((settings.riskPerTrade / settings.maxDrawdown) * 100).toFixed(2)}% del drawdown máximo`}
          >
            {numberField('riskPerTrade', { min: riskMin, max: riskMax, step: 10 })}
            <input
              type="range"
              min={riskMin}
              max={riskMax}
              step={10}
              value={settings.riskPerTrade}
              onChange={(e) => updateSettings({ riskPerTrade: Number(e.target.value) })}
              className="mt-2 w-full accent-[#F0B429]"
            />
          </Field>

          <Field
            label={`Stop diario personal ($) — rango ${dailyMin}–${dailyMax}`}
            hint={`Equivale a ${(settings.dailyStopLimit / Math.max(1, settings.riskPerTrade)).toFixed(1)} trades perdidos`}
          >
            {numberField('dailyStopLimit', { min: dailyMin, max: dailyMax, step: 50 })}
            <input
              type="range"
              min={dailyMin}
              max={dailyMax}
              step={50}
              value={settings.dailyStopLimit}
              onChange={(e) => updateSettings({ dailyStopLimit: Number(e.target.value) })}
              className="mt-2 w-full accent-[#F0B429]"
            />
          </Field>

          <Field label="R:R mínimo" hint={`Un trade de ${fmtUSD(settings.riskPerTrade)} debe buscar ${fmtUSD(settings.riskPerTrade * settings.minRR)}`}>
            <Toggle
              options={RR_OPTIONS.map((r) => ({ value: r, label: `1:${r}` }))}
              value={settings.minRR}
              onChange={(v) => updateSettings({ minRR: v })}
              size="sm"
            />
          </Field>

          <Field label="Máximo de trades por día">
            {numberField('maxTradesPerDay', { min: 1, max: 20 })}
          </Field>

          <Field label="Contratos por defecto">
            <Toggle
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
              value={settings.defaultContracts}
              onChange={(v) => updateSettings({ defaultContracts: v })}
              size="sm"
            />
          </Field>

          <Field label="Instrumento por defecto" hint={INSTRUMENTS[settings.defaultInstrument]?.name}>
            <select
              className="input"
              value={settings.defaultInstrument}
              onChange={(e) => updateSettings({ defaultInstrument: e.target.value })}
            >
              {CALC_INSTRUMENTS.map((k) => (
                <option key={k} value={k}>
                  {k} — {INSTRUMENTS[k].name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <NoteBox tone="yellow">
            Con {fmtUSD(settings.riskPerTrade)} por trade y un stop diario de {fmtUSD(settings.dailyStopLimit)}, tu día
            termina tras{' '}
            {Math.floor(settings.dailyStopLimit / Math.max(1, settings.riskPerTrade))} pérdidas completas. Tu margen
            actual de {fmtUSD(a.margin)} da para {a.tradesLeft} trades antes de tocar el suelo.
          </NoteBox>
        </div>
      </Section>

      <Section
        title="Datos"
        subtitle={`${trades.length} trades · ${dailyRecords.length} días registrados · sincronizado con tu cuenta`}
      >
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={doExportCsv}>
            Exportar CSV de trades
          </button>
        </div>

        <div className="mt-4">
          <NoteBox tone="blue">
            Tus datos viven en el servidor, asociados a esta cuenta — puedes cambiar de dispositivo sin perder nada.
            Exporta el CSV cuando quieras una copia local del diario de trades.
          </NoteBox>
        </div>
      </Section>
    </div>
  )
}
