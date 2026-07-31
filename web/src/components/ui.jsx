/* Primitivas visuales compartidas por todas las pantallas. */

export const TONE = {
  green: { text: 'text-win', border: 'border-win/40', bg: 'bg-win/10', dot: 'bg-win', ring: 'ring-win/30' },
  yellow: { text: 'text-gold', border: 'border-gold/40', bg: 'bg-gold/10', dot: 'bg-gold', ring: 'ring-gold/30' },
  red: { text: 'text-loss', border: 'border-loss/40', bg: 'bg-loss/10', dot: 'bg-loss', ring: 'ring-loss/30' },
  blue: { text: 'text-info', border: 'border-info/40', bg: 'bg-info/10', dot: 'bg-info', ring: 'ring-info/30' },
  neutral: { text: 'text-slate-200', border: 'border-border', bg: 'bg-panel2', dot: 'bg-slate-500', ring: 'ring-border' },
}

export function Section({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="text-base font-bold text-slate-100">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function MetricCard({ label, value, sub, tone = 'neutral', hint, children }) {
  const t = TONE[tone] ?? TONE.neutral
  return (
    <div className={`rounded-xl border p-4 ${t.border} ${t.bg} transition-colors`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-bold tnum ${t.text}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted tnum">{sub}</p>}
      {hint && <p className={`mt-1.5 text-[11px] font-semibold ${t.text}`}>{hint}</p>}
      {children}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function Toggle({ options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-panel2 border border-border p-1">
      {options.map((opt) => {
        const val = typeof opt === 'object' ? opt.value : opt
        const label = typeof opt === 'object' ? opt.label : opt
        const active = val === value
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`${pad} rounded-md font-semibold transition-colors ${
              active ? 'bg-gold text-black' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressBar({ value, tone = 'green', height = 'h-3' }) {
  const clamped = Math.max(0, Math.min(100, value))
  const color = tone === 'red' ? 'bg-loss' : tone === 'yellow' ? 'bg-gold' : tone === 'blue' ? 'bg-info' : 'bg-win'
  return (
    <div className={`w-full ${height} rounded-full bg-panel2 border border-border overflow-hidden`}>
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const t = TONE[tone] ?? TONE.neutral
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${t.border} ${t.bg} ${t.text} ${className}`}
    >
      {children}
    </span>
  )
}

export function Table({ columns, rows, renderCell, highlightRow, dense = false, className = '' }) {
  const pad = dense ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
  return (
    <div className={`overflow-x-auto -mx-1 ${className}`}>
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th
                key={i}
                className={`${pad} text-left text-[11px] font-bold uppercase tracking-wider text-muted whitespace-nowrap`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              className={`border-b border-border/50 last:border-0 hover:bg-panel2/60 transition-colors ${
                highlightRow?.(row, r) ?? ''
              }`}
            >
              {row.map((cell, c) => (
                <td key={c} className={`${pad} whitespace-nowrap tnum ${c === 0 ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                  {renderCell ? renderCell(cell, c, row, r) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({ icon = '∅', title, subtitle }) {
  return (
    <div className="py-10 text-center">
      <p className="text-3xl text-slate-700">{icon}</p>
      <p className="mt-2 text-sm font-semibold text-slate-400">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}
    </div>
  )
}

export function NoteBox({ children, tone = 'blue' }) {
  const t = TONE[tone] ?? TONE.blue
  return (
    <div className={`rounded-lg border ${t.border} ${t.bg} px-3 py-2.5 text-xs leading-relaxed ${t.text}`}>
      {children}
    </div>
  )
}
