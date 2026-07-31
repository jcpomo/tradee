import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Section, Table, Badge, NoteBox, Toggle, TONE } from './ui'
import {
  ACCOUNT_PARAMS,
  FORMULAS,
  TICK_TABLES,
  BRACKET_COLUMNS,
  RISK_100_SUMMARY,
  WEALTHCHARTS_INPUT,
  RISK_CARD,
  PRETRADE_CHECKLIST,
  IDEAL_SCHEDULE,
  CONTINUOUS_SYMBOL_NOTE,
  TRAILING_RULE,
} from '../data/apexRules'
import { SYMBOL_LEVELS, SESSIONS, CORRELATIONS, EXPIRATIONS, MONTH_LETTERS } from '../data/symbols'

const TABS = [
  { id: 'checklist', label: 'Checklist' },
  { id: 'ticks', label: 'Ticks & Brackets' },
  { id: 'symbols', label: 'Símbolos' },
  { id: 'schedule', label: 'Horarios' },
  { id: 'rules', label: 'Reglas Apex' },
]

export default function ReferenceGuide() {
  const [tab, setTab] = useState('checklist')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-panel p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[7rem] rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-gold text-black' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'checklist' && <ChecklistTab />}
      {tab === 'ticks' && <TicksTab />}
      {tab === 'symbols' && <SymbolsTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  )
}

/* ── Checklist pre-trade ──────────────────────────────────────────── */

function ChecklistTab() {
  const checklist = useStore((s) => s.checklist)
  const toggleChecklist = useStore((s) => s.toggleChecklist)
  const resetChecklist = useStore((s) => s.resetChecklist)

  const checked = PRETRADE_CHECKLIST.filter((_, i) => checklist[i]).length
  const allChecked = checked === PRETRADE_CHECKLIST.length

  return (
    <Section
      title="Checklist pre-trade — 8 preguntas antes de cada operación"
      subtitle="Si alguna respuesta es NO — no entras al trade"
      right={
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold tnum ${allChecked ? 'text-win' : 'text-gold'}`}>
            {checked} / {PRETRADE_CHECKLIST.length}
          </span>
          <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={resetChecklist}>
            Reiniciar
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {PRETRADE_CHECKLIST.map((q, i) => {
          const on = !!checklist[i]
          return (
            <button
              key={i}
              onClick={() => toggleChecklist(i)}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                on ? 'border-win/40 bg-win/10' : 'border-border bg-panel2 hover:border-slate-600'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                  on ? 'border-win bg-win text-black' : 'border-slate-600 text-transparent'
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className="mr-2 text-xs font-bold text-muted tnum">{i + 1}</span>
                <span className={`text-sm ${on ? 'text-win' : 'text-slate-200'}`}>{q}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {allChecked ? (
          <NoteBox tone="green">Las 8 respuestas son SÍ — el trade cumple tu plan. Ejecuta y no lo toques.</NoteBox>
        ) : (
          <NoteBox tone="yellow">
            Te faltan {PRETRADE_CHECKLIST.length - checked} respuestas. Mientras haya un NO, no entras.
          </NoteBox>
        )}
      </div>
    </Section>
  )
}

/* ── Tablas de ticks y brackets ───────────────────────────────────── */

function TicksTab() {
  const [inst, setInst] = useState('MNQ')
  const table = TICK_TABLES.find((t) => t.key === inst)

  const highlight = (row) => {
    const use = String(row[3] || '')
    if (use.includes('SUPERA')) return 'bg-loss/[0.08]'
    if (use.includes('estándar') || use.includes('ideal')) return 'bg-win/[0.06]'
    return ''
  }

  return (
    <div className="space-y-4">
      <Section
        title="Tablas de ticks"
        subtitle={table.subtitle}
        right={<Toggle options={TICK_TABLES.map((t) => t.key)} value={inst} onChange={setInst} size="sm" />}
      >
        <h3 className="mb-3 text-sm font-bold text-gold">{table.title}</h3>
        <Table columns={table.columns} rows={table.rows} highlightRow={highlight} dense />

        <h3 className="mt-6 mb-3 text-sm font-bold text-gold">Bracket Orders recomendados</h3>
        <Table
          columns={BRACKET_COLUMNS}
          rows={table.brackets}
          highlightRow={(row) => (String(row[0]).includes('LÍMITE') ? 'bg-loss/[0.08]' : String(row[0]).includes('Estándar') ? 'bg-win/[0.06]' : '')}
          dense
        />

        {table.note && (
          <div className="mt-4">
            <NoteBox tone="blue">{table.note}</NoteBox>
          </div>
        )}
      </Section>

      <Section title="Resumen — los 4 contratos con $100 de riesgo por trade">
        <Table
          columns={RISK_100_SUMMARY.columns}
          rows={RISK_100_SUMMARY.rows}
          highlightRow={(row) => (row[0] === 'MNQ' ? 'bg-gold/[0.08]' : '')}
          dense
        />
      </Section>

      <Section
        title="Lo que escribes en Wealthcharts"
        subtitle="Order Strategy → Simple, para $100 de riesgo"
      >
        <Table
          columns={WEALTHCHARTS_INPUT.columns}
          rows={WEALTHCHARTS_INPUT.rows}
          highlightRow={(row) => (String(row[0]).includes('MNQ') ? 'bg-gold/[0.08]' : '')}
          dense
        />
        <div className="mt-4">
          <NoteBox tone="blue">{WEALTHCHARTS_INPUT.note}</NoteBox>
        </div>
      </Section>
    </div>
  )
}

/* ── Símbolos ─────────────────────────────────────────────────────── */

function SymbolsTab() {
  return (
    <div className="space-y-4">
      {SYMBOL_LEVELS.map((lvl) => {
        const tone = lvl.accent === 'win' ? 'green' : lvl.accent === 'gold' ? 'yellow' : 'blue'
        return (
          <Section
            key={lvl.level}
            title={`${lvl.level} — ${lvl.title}`}
            subtitle={lvl.subtitle}
            right={<Badge tone={tone}>{lvl.rows.length} símbolos</Badge>}
          >
            <Table
              columns={lvl.columns}
              rows={lvl.rows}
              highlightRow={(row) => (row.some((c) => String(c).includes('TU CONTRATO')) ? 'bg-gold/[0.08]' : '')}
              dense
            />
          </Section>
        )
      })}

      <Section title="Calendario de vencimientos 2026-2027">
        <Table
          columns={['Trimestre', 'Mes', 'Letra', 'Vencimiento', 'Código', 'Rollover recomendado']}
          rows={EXPIRATIONS.map((e) => [e.quarter, e.month, e.letter, e.expiry, e.codes, e.rollover])}
          highlightRow={(row) => (String(row[0]).includes('ACTUAL') ? 'bg-gold/[0.08]' : '')}
          dense
        />

        <h3 className="mt-6 mb-3 text-sm font-bold text-gold">Letras de mes</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {MONTH_LETTERS.map((m) => (
            <div
              key={m.letter}
              className={`rounded-lg border px-2 py-2 text-center ${
                m.current
                  ? 'border-gold bg-gold/15'
                  : m.active
                    ? 'border-info/40 bg-info/10'
                    : 'border-border bg-panel2'
              }`}
            >
              <p className={`text-lg font-black ${m.current ? 'text-gold' : m.active ? 'text-info' : 'text-slate-500'}`}>
                {m.letter}
              </p>
              <p className="text-[10px] text-muted">{m.month}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <NoteBox tone="blue">{CONTINUOUS_SYMBOL_NOTE}</NoteBox>
        </div>
      </Section>

      <Section title="Correlaciones entre mercados">
        <div className="space-y-2">
          {CORRELATIONS.map((c, i) => {
            const t = c.tone === 'pos' ? TONE.green : TONE.red
            return (
              <div key={i} className={`rounded-lg border ${t.border} ${t.bg} px-3 py-2.5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{c.a}</span>
                  <span className="text-muted text-xs">↔</span>
                  <span className="text-sm font-bold text-slate-100">{c.b}</span>
                  <span className={`ml-auto text-[11px] font-bold ${t.text}`}>{c.corr}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{c.meaning}</p>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

/* ── Horarios ─────────────────────────────────────────────────────── */

function ScheduleTab() {
  const toneOf = (t) => (t === 'best' ? 'green' : t === 'good' ? 'green' : t === 'bad' ? 'red' : 'yellow')

  return (
    <div className="space-y-4">
      <Section title="Horarios de trading" subtitle="Hora ET y su equivalente CET (España / Alemania)">
        <div className="space-y-2">
          {SESSIONS.map((s) => {
            const t = TONE[toneOf(s.tone)]
            return (
              <div key={s.name} className={`rounded-lg border ${t.border} ${t.bg} p-3`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={`text-sm font-bold ${t.text}`}>{s.name}</p>
                  <div className="flex items-center gap-3 text-xs tnum">
                    <span className="text-muted">ET {s.et}</span>
                    <span className="font-bold text-slate-100">CET {s.cet}</span>
                    <span className={`font-semibold ${t.text}`}>{s.volume}</span>
                  </div>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <p className="text-xs text-slate-300">
                    <span className="text-muted">Para qué sirve: </span>
                    {s.para}
                  </p>
                  <p className="text-xs text-slate-300">
                    <span className="text-muted">Evitar porque: </span>
                    {s.evitar}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4">
          <NoteBox tone="green">{IDEAL_SCHEDULE}</NoteBox>
        </div>
      </Section>
    </div>
  )
}

/* ── Reglas Apex ──────────────────────────────────────────────────── */

function RulesTab() {
  const toneMap = { bad: TONE.red, warn: TONE.yellow, good: TONE.green, neutral: TONE.neutral }

  return (
    <div className="space-y-4">
      <Section title="Parámetros de la cuenta 50K">
        <Table columns={['Parámetro', 'Valor', 'Descripción']} rows={ACCOUNT_PARAMS} dense />
        <div className="mt-4">
          <NoteBox tone="red">{TRAILING_RULE}</NoteBox>
        </div>
      </Section>

      <Section title="Fórmulas del suelo" subtitle="Lo que la app calcula por ti en cada pantalla">
        <Table columns={['Cálculo', 'Fórmula']} rows={FORMULAS} dense />
      </Section>

      <Section title="Plan de riesgo — tarjeta de referencia rápida">
        <div className="space-y-2">
          {RISK_CARD.map(([param, value, desc, tone], i) => {
            const t = toneMap[tone] ?? TONE.neutral
            return (
              <div key={i} className={`rounded-lg border ${t.border} ${t.bg} px-3 py-2.5`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted min-w-[10rem]">{param}</span>
                  <span className={`text-sm font-bold ${t.text}`}>{value}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{desc}</p>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
