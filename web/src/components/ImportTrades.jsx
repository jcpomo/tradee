import { useState, useEffect, useRef } from 'react'
import { useAccounts } from '../store/useAccounts'
import { useStore } from '../store/useStore'
import { Section, NoteBox, Badge, EmptyState, Table } from './ui'
import { fmtSignedUSD, fmtDate } from '../utils/calculations'
import * as importApi from '../api/importApi'

export default function ImportTrades() {
  const activeAccountId = useAccounts((s) => s.activeId)
  const hydrate = useStore((s) => s.hydrate)

  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null) // { summary, proposed }
  const [rebuild, setRebuild] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [batches, setBatches] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [undoingId, setUndoingId] = useState(null)

  const flash = (tone, text) => {
    setMsg({ tone, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const loadBatches = async () => {
    if (!activeAccountId) return
    setLoadingBatches(true)
    try {
      const { batches: list } = await importApi.listBatches(activeAccountId)
      setBatches(list)
    } catch (err) {
      flash('red', `No se pudo cargar el historial: ${err.message}`)
    } finally {
      setLoadingBatches(false)
    }
  }

  useEffect(() => {
    loadBatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId])

  const handleFile = async (f) => {
    if (!f || !activeAccountId) return
    setFile(f)
    setPreview(null)
    setLoadingPreview(true)
    try {
      const data = await importApi.preview(activeAccountId, f)
      setPreview(data)
    } catch (err) {
      flash('red', `No se pudo previsualizar el archivo: ${err.message}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  const onInputChange = (e) => handleFile(e.target.files?.[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const resetFile = () => {
    setFile(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onConfirm = async () => {
    if (!preview || !activeAccountId) return
    setCommitting(true)
    try {
      const { insertedCount } = await importApi.commit(activeAccountId, {
        filename: file?.name || null,
        rebuildDailyRecords: rebuild,
        newBalance: null,
      })
      flash('green', `Importación confirmada: ${insertedCount} trades nuevos`)
      resetFile()
      await hydrate(activeAccountId)
      await loadBatches()
    } catch (err) {
      flash('red', `No se pudo confirmar la importación: ${err.message}`)
    } finally {
      setCommitting(false)
    }
  }

  const onUndo = async (id) => {
    setUndoingId(id)
    try {
      await importApi.undoBatch(id)
      flash('green', 'Lote de importación deshecho')
      await loadBatches()
      await hydrate(activeAccountId)
    } catch (err) {
      flash('red', `No se pudo deshacer el lote: ${err.message}`)
    } finally {
      setUndoingId(null)
    }
  }

  const summary = preview?.summary
  const proposed = preview?.proposed || []
  const totalCommission = proposed.reduce((a, t) => a + (t.commission || 0), 0)

  return (
    <div className="space-y-4">
      {msg && <NoteBox tone={msg.tone === 'red' ? 'red' : 'green'}>{msg.text}</NoteBox>}

      <Section
        title="Importar trades"
        subtitle="Sube un CSV de órdenes exportado del broker para previsualizar y confirmar la importación"
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-gold bg-gold/10' : 'border-border bg-panel2 hover:border-gold/50'
          }`}
        >
          <span className="text-2xl">⇪</span>
          <p className="text-sm font-semibold text-slate-200">
            {file ? file.name : 'Arrastra tu CSV aquí o haz clic para elegir un archivo'}
          </p>
          <p className="text-xs text-muted">Detecta automáticamente WealthCharts (export de órdenes) y Tradovate (export de <b>Fills</b>).</p>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />
        </div>

        {loadingPreview && <p className="mt-3 text-xs text-muted">Analizando archivo…</p>}

        {summary && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {summary.platform && (
                <Badge tone={summary.platform === 'Tradovate' ? 'blue' : 'green'}>
                  Detectado: {summary.platform}
                </Badge>
              )}
              {totalCommission > 0 ? (
                <span className="text-xs text-muted">
                  P&L <b className="text-slate-200">neto</b> — comisiones incluidas ({fmtSignedUSD(-totalCommission, 2)})
                </span>
              ) : (
                <span className="text-xs text-muted">P&L según el broker (ya neto, con comisiones)</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { l: 'Fills', v: summary.fills },
                { l: 'Trades', v: summary.trades },
                { l: 'Nuevos', v: summary.inserted, tone: 'text-win' },
                { l: 'Duplicados', v: summary.duplicates, tone: summary.duplicates ? 'text-gold' : 'text-slate-100' },
                { l: 'P&L neto', v: fmtSignedUSD(summary.netPnl, 2), tone: summary.netPnl >= 0 ? 'text-win' : 'text-loss' },
                { l: 'Rango de fechas', v: `${fmtDate(summary.dateFrom)} → ${fmtDate(summary.dateTo)}` },
              ].map((s) => (
                <div key={s.l} className="rounded-lg border border-border bg-panel2 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{s.l}</p>
                  <p className={`mt-1 text-lg font-bold tnum ${s.tone || 'text-slate-100'}`}>{s.v}</p>
                </div>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table
                columns={['Fecha', 'Hora', 'Instr.', 'Dir.', 'Cont.', 'Result.', 'P&L', 'Estado']}
                rows={proposed.map((t) => [t.date, t.time, t.instrument, t.direction, t.contracts, t.result, t.pnl, t.duplicate])}
                highlightRow={(row) => (row[7] ? 'opacity-50' : '')}
                renderCell={(cell, c, row) => {
                  if (c === 0) return fmtDate(cell)
                  if (c === 6) {
                    const tone = row[6] > 0 ? 'text-win' : row[6] < 0 ? 'text-loss' : 'text-slate-300'
                    return <span className={`font-bold ${tone}`}>{fmtSignedUSD(row[6], 2)}</span>
                  }
                  if (c === 7) return cell ? <Badge tone="yellow">Duplicado</Badge> : <Badge tone="green">Nuevo</Badge>
                  return cell
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#F0B429]"
                  checked={rebuild}
                  onChange={(e) => setRebuild(e.target.checked)}
                />
                Reconstruir suelo (recalcular los registros diarios a partir de estos trades)
              </label>
              <button className="btn-primary" onClick={onConfirm} disabled={committing || summary.inserted === 0}>
                {committing ? 'Confirmando…' : `Confirmar (${summary.inserted} nuevos)`}
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Historial de importaciones"
        subtitle={`${batches.length} lote${batches.length === 1 ? '' : 's'} importado${batches.length === 1 ? '' : 's'}`}
      >
        {loadingBatches ? (
          <p className="text-xs text-muted">Cargando historial…</p>
        ) : batches.length === 0 ? (
          <EmptyState icon="⇪" title="Todavía no has importado ningún CSV" subtitle="Cuando importes trades, los lotes aparecerán aquí para poder deshacerlos" />
        ) : (
          <Table
            columns={['Fecha', 'Archivo', 'Trades', 'Nuevos', 'Duplicados', 'P&L neto', 'Rango', '']}
            rows={batches.map((b) => [
              b.created_at,
              b.filename || '—',
              b.trade_count,
              b.inserted_count,
              b.duplicate_count,
              b.net_pnl,
              `${b.date_from ?? ''}|${b.date_to ?? ''}`,
              b.id,
            ])}
            renderCell={(cell, c, row) => {
              if (c === 0) return fmtDate(String(cell).slice(0, 10))
              if (c === 5) return <span className={Number(row[5]) >= 0 ? 'text-win' : 'text-loss'}>{fmtSignedUSD(row[5], 2)}</span>
              if (c === 6) {
                const [from, to] = String(cell).split('|')
                return from ? `${fmtDate(from)} → ${fmtDate(to)}` : '—'
              }
              if (c === 7) {
                return (
                  <button
                    onClick={() => onUndo(cell)}
                    disabled={undoingId === cell}
                    className="text-xs font-semibold text-loss hover:text-loss/70 transition-colors disabled:opacity-50"
                  >
                    {undoingId === cell ? 'Deshaciendo…' : 'Deshacer'}
                  </button>
                )
              }
              return cell
            }}
          />
        )}
      </Section>
    </div>
  )
}
