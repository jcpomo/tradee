export const INSTRUMENTS = {
  MNQ: { pointValue: 2, tickValue: 0.5, ticksPerPt: 4 },
  NQ: { pointValue: 20, tickValue: 5.0, ticksPerPt: 4 },
  MES: { pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  ES: { pointValue: 50, tickValue: 12.5, ticksPerPt: 4 },
  M2K: { pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  MYM: { pointValue: 0.5, tickValue: 0.5, ticksPerPt: 1 },
  MGC: { pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
  MCL: { pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
}
export function symbolToInstrument(symbol) {
  if (!symbol) return null
  let s = symbol.includes('.') ? symbol.split('.').pop() : symbol
  s = s.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, '')
  return INSTRUMENTS[s] ? s : INSTRUMENTS[symbol] ? symbol : s || null
}
