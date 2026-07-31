// Multiplicadores por contrato. tickValue = pointValue / ticksPerPt.
export const INSTRUMENTS = {
  MNQ: { name: 'Micro E-mini Nasdaq-100', pointValue: 2, tickValue: 0.5, ticksPerPt: 4 },
  NQ: { name: 'E-mini Nasdaq-100', pointValue: 20, tickValue: 5.0, ticksPerPt: 4 },
  MES: { name: 'Micro E-mini S&P 500', pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  ES: { name: 'E-mini S&P 500', pointValue: 50, tickValue: 12.5, ticksPerPt: 4 },
  M2K: { name: 'Micro E-mini Russell 2000', pointValue: 5, tickValue: 1.25, ticksPerPt: 4 },
  MYM: { name: 'Micro E-mini Dow Jones', pointValue: 0.5, tickValue: 0.5, ticksPerPt: 1 },
  MGC: { name: 'Micro Gold', pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
  MCL: { name: 'Micro Crude Oil', pointValue: 1, tickValue: 1.0, ticksPerPt: 1 },
  M6E: { name: 'Micro EUR/USD', pointValue: 1.25, tickValue: 1.25, ticksPerPt: 1 },
  M6B: { name: 'Micro GBP/USD', pointValue: 1.25, tickValue: 1.25, ticksPerPt: 1 },
}

// Los 8 instrumentos del selector de la calculadora (spec 3.2)
export const CALC_INSTRUMENTS = ['MNQ', 'NQ', 'MES', 'ES', 'M2K', 'MYM', 'MGC', 'MCL']

export const INSTRUMENT_KEYS = Object.keys(INSTRUMENTS)

export const tickSize = (key) => 1 / INSTRUMENTS[key].ticksPerPt
