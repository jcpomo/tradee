export const PRESETS = {
  '25K': { initialBalance: 25000, maxDrawdown: 1500, profitTarget: 1500, maxContracts: 4 },
  '50K': { initialBalance: 50000, maxDrawdown: 2000, profitTarget: 3000, maxContracts: 6 },
  '50K-legacy': { initialBalance: 50000, maxDrawdown: 2500, profitTarget: 3000, maxContracts: 10 },
  '75K': { initialBalance: 75000, maxDrawdown: 2750, profitTarget: 4500, maxContracts: 12 },
  '100K': { initialBalance: 100000, maxDrawdown: 3000, profitTarget: 6000, maxContracts: 8 },
  '150K': { initialBalance: 150000, maxDrawdown: 4000, profitTarget: 9000, maxContracts: 12 },
  '250K': { initialBalance: 250000, maxDrawdown: 6500, profitTarget: 15000, maxContracts: 17 },
  '300K': { initialBalance: 300000, maxDrawdown: 7500, profitTarget: 20000, maxContracts: 20 },
  '100K-static': { initialBalance: 100000, maxDrawdown: 625, profitTarget: 2000, maxContracts: 2 },
}
export const DRAWDOWN_MODES = ['intraday', 'eod', 'static']
export function presetFor(label) { return PRESETS[label] || null }
