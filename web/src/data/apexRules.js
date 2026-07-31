// Reglas fijas de la cuenta y tablas de referencia (Parte 2 del documento).

export const APEX_ACCOUNT = {
  name: 'Apex Trader Funding — 50K Intraday Trailing Drawdown',
  initialBalance: 50000,
  maxDrawdown: 2000,
  initialFloor: 48000,
  profitTarget: 3000,
  targetBalance: 53000,
  maxContracts: 6,
  evalDays: 30,
  dailyLimit: 'NO HAY — el trader se lo pone',
}

export const ACCOUNT_PARAMS = [
  ['Balance inicial', '$50.000', 'Capital de partida de la evaluación'],
  ['Drawdown máximo', '$2.000', 'Máxima pérdida total permitida desde el pico'],
  ['Suelo inicial', '$48.000', 'Balance inicial − drawdown máximo'],
  ['Objetivo', '$53.000', 'Balance inicial + $3.000 de beneficio'],
  ['Contratos máx. eval.', '6', 'Máximo de contratos simultáneos'],
  ['Plazo', '30 días', 'Para alcanzar el objetivo'],
  ['Límite diario oficial', 'NO HAY', 'Apex no impone límite diario — el trader se lo pone'],
]

export const FORMULAS = [
  ['Suelo actual', 'Peak Balance − $2.000'],
  ['Peak Balance', 'MAX(balance inicial, mayor balance alcanzado histórico)'],
  ['Margen disponible', 'Balance actual − Suelo actual'],
  ['Progreso objetivo', '((Balance actual − 50.000) / 3.000) × 100'],
  ['Trades hasta el suelo', 'FLOOR(Margen disponible / Riesgo por trade)'],
  ['Stop diario restante', 'Stop diario personal − SUM(pérdidas del día)'],
  ['Días restantes eval.', '30 − días desde fecha de inicio'],
]

// Tablas de ticks completas por instrumento
export const TICK_TABLES = [
  {
    key: 'MNQ',
    title: 'MNQ — Micro E-mini Nasdaq-100',
    subtitle: '$2 por punto · $0.50 por tick',
    columns: ['Ticks', 'Puntos', 'Valor $', 'Uso Bracket Order', 'Plan de riesgo'],
    rows: [
      ['20', '5 pts', '$10', 'SL muy pequeño', 'Solo scalping extremo'],
      ['40', '10 pts', '$20', 'SL / TP', 'SL para riesgo $20'],
      ['80', '20 pts', '$40', 'SL / TP', 'SL para riesgo $40'],
      ['100', '25 pts', '$50', 'SL conservador', 'SL para plan $50/trade'],
      ['160', '40 pts', '$80', 'SL / TP', '—'],
      ['200', '50 pts', '$100', 'SL estándar', 'SL plan de $100/trade'],
      ['240', '60 pts', '$120', 'TP', 'TP si SL=120 ticks (1:2)'],
      ['300', '75 pts', '$150', 'TP', 'TP si SL=100 ticks (1:1.5)'],
      ['400', '100 pts', '$200', 'TP estándar', 'TP si SL=200 ticks (1:2)'],
      ['500', '125 pts', '$250', 'TP', 'TP si SL=200 ticks (1:2.5)'],
      ['600', '150 pts', '$300', 'TP ideal', 'TP si SL=200 ticks (1:3)'],
      ['800', '200 pts', '$400', 'TP agresivo', 'TP si SL=200 ticks (1:4)'],
    ],
    brackets: [
      ['Ultra conservador', '80', '40', '$20', '$40', '1:2'],
      ['Conservador', '200', '100', '$50', '$100', '1:2'],
      ['Estándar (plan)', '400', '200', '$100', '$200', '1:2'],
      ['Estándar 1:3', '600', '200', '$100', '$300', '1:3'],
      ['LÍMITE plan', '400', '400', '$200 — máximo', '$400', '1:2'],
    ],
    note: 'Tu configuración actual en Wealthcharts: TP=200 / SL=100 → $50 riesgo, $100 beneficio, R:R 1:2 (nivel conservador — correcto para empezar)',
  },
  {
    key: 'NQ',
    title: 'NQ — E-mini Nasdaq-100',
    subtitle: '$20 por punto · $5.00 por tick',
    columns: ['Ticks', 'Puntos', 'Valor $', 'Uso Bracket', 'Nota'],
    rows: [
      ['4', '1 pt', '$20', '—', 'Mínimo — demasiado ajustado'],
      ['8', '2 pts', '$40', 'SL muy ajustado', 'Solo scalping extremo'],
      ['12', '3 pts', '$60', 'SL ajustado', 'Stop pequeño'],
      ['20', '5 pts', '$100', 'SL estándar', 'SL para riesgo $100'],
      ['32', '8 pts', '$160', 'SL', '—'],
      ['40', '10 pts', '$200', 'SUPERA PLAN', 'Supera límite $200 por trade'],
      ['40', '10 pts', '$200', 'TP 1:2', 'TP si SL=20 ticks'],
      ['60', '15 pts', '$300', 'TP 1:3', 'TP si SL=20 ticks'],
      ['80', '20 pts', '$400', 'TP 1:4', 'TP agresivo'],
    ],
    brackets: [
      ['Conservador 1 NQ', '40', '20', '$100', '$200', '1:2'],
      ['Estándar 1 NQ', '60', '20', '$100', '$300', '1:3'],
      ['Agresivo 1 NQ', '80', '20', '$100', '$400', '1:4'],
    ],
    note: 'El NQ mueve muchos más puntos que el MNQ. Un SL de 5 puntos (20 ticks) en NQ puede ser barrido por el ruido normal del mercado en 1m. Usar gráficos de 5m o 15m para NQ/ES.',
  },
  {
    key: 'MES',
    title: 'MES — Micro E-mini S&P 500',
    subtitle: '$5 por punto · $1.25 por tick',
    columns: ['Ticks', 'Puntos', 'Valor $', 'Uso Bracket', 'Nota'],
    rows: [
      ['8', '2 pts', '$10', 'SL mínimo', 'Demasiado ajustado'],
      ['20', '5 pts', '$25', 'SL', '—'],
      ['40', '10 pts', '$50', 'SL conservador', 'SL para riesgo $50'],
      ['60', '15 pts', '$75', 'SL', '—'],
      ['80', '20 pts', '$100', 'SL estándar', 'SL para riesgo $100'],
      ['100', '25 pts', '$125', 'SL', '—'],
      ['160', '40 pts', '$200', 'TP 1:2 (SL=80)', 'TP si SL=80 ticks'],
      ['200', '50 pts', '$250', 'TP 1:2.5', '—'],
      ['240', '60 pts', '$300', 'TP 1:3', 'TP si SL=80 ticks (ideal)'],
      ['320', '80 pts', '$400', 'TP 1:4', 'TP agresivo'],
    ],
    brackets: [
      ['Conservador', '80', '40', '$50', '$100', '1:2'],
      ['Estándar', '160', '80', '$100', '$200', '1:2'],
      ['Ideal 1:3', '240', '80', '$100', '$300', '1:3'],
      ['Agresivo', '320', '80', '$100', '$400', '1:4'],
    ],
    note: null,
  },
  {
    key: 'ES',
    title: 'ES — E-mini S&P 500',
    subtitle: '$50 por punto · $12.50 por tick',
    columns: ['Ticks', 'Puntos', 'Valor $', 'Uso Bracket', 'Nota'],
    rows: [
      ['1', '0.25 pts', '$12.50', '—', 'Mínimo — sin sentido como SL'],
      ['4', '1 pt', '$50', 'SL mínimo', 'El ruido normal del ES ya lo barre'],
      ['8', '2 pts', '$100', 'SL estándar', 'SL para riesgo $100 — muy ajustado'],
      ['12', '3 pts', '$150', 'SUPERA PLAN', 'Supera límite $100 por trade'],
      ['16', '4 pts', '$200', 'TP 1:2', 'TP si SL=8 ticks'],
      ['24', '6 pts', '$300', 'TP 1:3', 'TP si SL=8 ticks (ideal)'],
      ['32', '8 pts', '$400', 'TP 1:4', 'TP agresivo'],
    ],
    brackets: [
      ['Conservador 1 ES', '16', '8', '$100', '$200', '1:2'],
      ['Estándar 1 ES', '24', '8', '$100', '$300', '1:3'],
      ['Agresivo 1 ES', '32', '8', '$100', '$400', '1:4'],
    ],
    note: null,
  },
]

export const BRACKET_COLUMNS = ['Nombre', 'TP (Ticks)', 'SL (Ticks)', 'Riesgo', 'Beneficio', 'R:R']

// Resumen — los 4 contratos con $100 de riesgo por trade
export const RISK_100_SUMMARY = {
  columns: ['Contrato', '$/Pto', '$/Tick', 'SL (Ticks)', 'SL (Puntos)', 'SL ($)', 'TP 1:2 (Ticks)', 'TP 1:2 ($)', 'TP 1:3 (Ticks)'],
  rows: [
    ['MNQ', '$2', '$0.50', '200', '50 pts', '$100', '400', '$200', '600'],
    ['NQ', '$20', '$5.00', '20', '5 pts', '$100', '40', '$200', '60'],
    ['MES', '$5', '$1.25', '80', '20 pts', '$100', '160', '$200', '240'],
    ['ES', '$50', '$12.50', '8', '2 pts', '$100', '16', '$200', '24'],
  ],
}

export const WEALTHCHARTS_INPUT = {
  columns: ['Contrato', 'TP (Ticks)', 'SL (Ticks)', 'Riesgo', 'R:R 1:2', 'R:R 1:3'],
  rows: [
    ['MNQ  ← TU CONTRATO', '400', '200', '$100', 'TP=400', 'TP=600'],
    ['NQ', '40', '20', '$100', 'TP=40', 'TP=60'],
    ['MES', '160', '80', '$100', 'TP=160', 'TP=240'],
    ['ES', '16', '8', '$100', 'TP=16', 'TP=24'],
  ],
  note: 'Configuración actual del trader: TP=200 / SL=100 en MNQ → $50 de riesgo / $100 de beneficio / R:R 1:2. Es el nivel conservador correcto para empezar.',
}

export const RISK_CARD = [
  ['Suelo inicial', '$48.000', 'Si el balance toca esto = CUENTA MUERTA PARA SIEMPRE', 'bad'],
  ['Objetivo', '$53.000', 'Ganar $3.000 en 30 días', 'good'],
  ['Riesgo por trade', '$200 (estándar) / $100 (conservador)', '1% del drawdown máximo', 'neutral'],
  ['Stop diario personal', 'Parar tras 3 pérdidas = -$600 max', 'Si llegas aquí: cerrar la plataforma', 'warn'],
  ['R:R mínimo', '1:2 siempre', 'No entrar si no hay espacio suficiente', 'neutral'],
  ['1 MNQ — SL / TP', 'SL: 200 ticks ($100) / TP: 400 ticks ($200)', 'Configuración estándar Wealthcharts', 'neutral'],
  ['1 NQ — SL / TP', 'SL: 20 ticks ($100) / TP: 40 ticks ($200)', 'Para cuando pases a contratos grandes', 'neutral'],
  ['1 MES — SL / TP', 'SL: 80 ticks ($100) / TP: 160 ticks ($200)', 'Alternativa más tranquila al MNQ', 'neutral'],
  ['1 ES — SL / TP', 'SL: 8 ticks ($100) / TP: 16 ticks ($200)', 'Para cuando pases a contratos grandes', 'neutral'],
  ['Posiciones a la vez', 'UNA SOLA', 'Cerrar antes de abrir otra — trampa del intraday', 'warn'],
  ['Piramiding', 'NO hasta que suelo > $50.000', 'Cuando hayas ganado más de $2.000', 'warn'],
  ['Hedging', 'PROHIBIDO', 'Cuenta cerrada inmediatamente por Apex', 'bad'],
]

export const PRETRADE_CHECKLIST = [
  '¿He identificado el nivel exacto donde va el stop loss?',
  '¿El riesgo en dólares es de $200 o menos?',
  '¿Hay espacio para un TP de al menos el doble del SL? (R:R ≥ 1:2)',
  '¿Solo tengo UNA posición abierta (o ninguna)?',
  '¿No he perdido ya 3 trades seguidos hoy?',
  '¿El suelo actual de mi cuenta está al menos $300 por debajo del balance?',
  '¿No hay noticias macro en los próximos 30 minutos? (FOMC, NFP, CPI, Earnings)',
  '¿El setup coincide exactamente con mi estrategia definida?',
]

export const IDEAL_SCHEDULE =
  'TU HORARIO IDEAL (CET — España/Alemania): 15:30 - 17:30 (apertura NY) y opcionalmente 19:30 - 22:00 (tarde NY). Cerrar todo antes de las 22:00. Con solo la ventana de 15:30-17:30 tienes suficiente para una sesión completa.'

export const CONTINUOUS_SYMBOL_NOTE =
  'Usar MNQ1 / MES1 / NQ1 / ES1 en Wealthcharts para no tener que hacer el rollover manualmente. El símbolo continuo (terminado en 1) siempre apunta al contrato con más volumen activo.'

export const TRAILING_RULE =
  'REGLA CRÍTICA: El suelo sube también con ganancias NO realizadas (posiciones abiertas en verde). Si tienes +$500 en una posición abierta, el suelo ya subió $500 aunque no hayas cerrado nada.'
