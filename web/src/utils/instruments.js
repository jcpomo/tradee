// Re-export de los datos de instrumentos + helpers de presentación.
export { INSTRUMENTS, CALC_INSTRUMENTS, INSTRUMENT_KEYS, tickSize } from '../data/instruments'

import { INSTRUMENTS } from '../data/instruments'

export const instrumentLabel = (key) => {
  const i = INSTRUMENTS[key]
  return i ? `${key} — ${i.name}` : key
}

export const instrumentSummary = (key) => {
  const i = INSTRUMENTS[key]
  if (!i) return ''
  return `$${i.pointValue} por punto · $${i.tickValue.toFixed(2)} por tick · ${i.ticksPerPt} tick${
    i.ticksPerPt > 1 ? 's' : ''
  } por punto`
}

// Cuántos decimales mostrar en los precios de ese instrumento
export const priceStep = (key) => {
  const i = INSTRUMENTS[key]
  if (!i) return 0.25
  return i.ticksPerPt === 4 ? 0.25 : i.ticksPerPt === 1 ? 1 : 1 / i.ticksPerPt
}
