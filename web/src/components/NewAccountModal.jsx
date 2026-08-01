import { useState } from 'react'
import { Section, Field, Toggle, NoteBox } from './ui'
import { PRESETS, DRAWDOWN_MODES } from '../data/apexPresets'
import { useAccounts } from '../store/useAccounts'
import { calcFloorByMode, fmtUSD } from '../utils/calculations'

export default function NewAccountModal({ onClose }) {
  const create = useAccounts((s) => s.create)
  const activate = useAccounts((s) => s.activate)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('intraday')
  const [size, setSize] = useState('50K')
  const [vals, setVals] = useState(PRESETS['50K'])
  const [busy, setBusy] = useState(false)
  const onSize = (s) => { setSize(s); setVals(PRESETS[s]) }
  const floor = calcFloorByMode({ mode, peakBalance: vals.initialBalance, currentBalance: vals.initialBalance, initialBalance: vals.initialBalance, maxDrawdown: vals.maxDrawdown, dailyCloses: [] })
  const submit = async () => {
    setBusy(true)
    try {
      const acc = await create({ name: name || `Mi ${size} ${mode}`, drawdownMode: mode, sizeLabel: size, ...vals })
      await activate(acc.id); onClose()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md">
        <Section title="Nueva cuenta" right={<button onClick={onClose} className="text-muted hover:text-loss">✕</button>}>
          <div className="space-y-4">
            <Field label="Nombre"><input className="input" placeholder={`Mi ${size} ${mode}`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Modo de drawdown">
              <Toggle options={DRAWDOWN_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} size="sm" />
              <p className="mt-1 text-[11px] text-muted">{DRAWDOWN_MODES.find((m) => m.value === mode).hint}</p>
            </Field>
            <Field label="Tamaño (preset)">
              <select className="input" value={size} onChange={(e) => onSize(e.target.value)}>
                {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {[['initialBalance', 'Balance inicial'], ['maxDrawdown', 'Drawdown máx.'], ['profitTarget', 'Objetivo'], ['maxContracts', 'Contratos máx.']].map(([k, l]) => (
                <Field key={k} label={l}><input type="number" className="input tnum" value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))} /></Field>
              ))}
            </div>
            <NoteBox tone="blue">Suelo inicial con este modo: <b>{fmtUSD(floor)}</b>. Todo es editable ahora y después en Configuración.</NoteBox>
            <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? '...' : 'Crear cuenta'}</button>
          </div>
        </Section>
      </div>
    </div>
  )
}
