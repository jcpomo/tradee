import { useAccount } from '../store/useAccount'
import { fmtUSD } from '../utils/calculations'

const STYLES = {
  red: 'border-loss/50 bg-loss/12 text-loss',
  yellow: 'border-gold/50 bg-gold/12 text-gold',
  green: 'border-win/50 bg-win/12 text-win',
}

const ICONS = { red: '▲', yellow: '●', green: '✓' }

function Banner({ tone, title, detail, pulse }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${STYLES[tone]} ${
        pulse ? 'animate-pulseSoft' : ''
      }`}
    >
      <span className="text-sm font-bold leading-5">{ICONS[tone]}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold uppercase tracking-wide">{title}</p>
        {detail && <p className="mt-0.5 text-xs opacity-90 leading-relaxed">{detail}</p>}
      </div>
    </div>
  )
}

/**
 * Los 4 banners de la spec 3.1 + aviso de máximo de trades del día.
 */
export function useAlerts() {
  const a = useAccount()
  const alerts = []

  if (a.currentBalance < a.floor + 300) {
    alerts.push({
      key: 'floor',
      tone: 'red',
      pulse: true,
      title: 'PELIGRO: Muy cerca del suelo',
      detail: `Balance ${fmtUSD(a.currentBalance)} · Suelo ${fmtUSD(a.floor)} · Solo ${fmtUSD(
        a.margin,
      )} de margen. No abras posiciones.`,
    })
  }

  if (a.dayStats.consecutiveLosses >= 3) {
    alerts.push({
      key: 'streak',
      tone: 'red',
      pulse: true,
      title: 'PARA EL DÍA — Stop diario alcanzado',
      detail: `${a.dayStats.consecutiveLosses} pérdidas seguidas hoy. Cierra la plataforma: la siguiente operación es revancha, no estrategia.`,
    })
  }

  if (a.dayStats.dailyRemaining <= 0) {
    alerts.push({
      key: 'daily-out',
      tone: 'red',
      title: 'Stop diario agotado',
      detail: `Has perdido ${fmtUSD(a.dayStats.lossesUSD)} hoy, tu límite es ${fmtUSD(
        a.settings.dailyStopLimit,
      )}. Se acabó la sesión.`,
    })
  } else if (a.dayStats.lossesUSD >= a.settings.dailyStopLimit * 0.8) {
    alerts.push({
      key: 'daily-80',
      tone: 'yellow',
      title: 'Stop diario al 80% consumido',
      detail: `Te quedan ${fmtUSD(a.dayStats.dailyRemaining)} de los ${fmtUSD(
        a.settings.dailyStopLimit,
      )} de hoy. Una pérdida más y cierras.`,
    })
  }

  if (a.dayStats.count >= a.settings.maxTradesPerDay) {
    alerts.push({
      key: 'max-trades',
      tone: 'yellow',
      title: `Máximo de trades del día alcanzado (${a.settings.maxTradesPerDay})`,
      detail: 'Tu plan dice que ya no operas más hoy, ganes o pierdas.',
    })
  }

  if (a.currentBalance > a.protectionBalance) {
    alerts.push({
      key: 'protected',
      tone: 'green',
      title: 'SUELO PROTEGIDO: Ya no puedes perder el capital inicial',
      detail: `Suelo actual ${fmtUSD(a.floor)} — por encima de los ${fmtUSD(
        a.settings.initialBalance,
      )} de partida.`,
    })
  }

  return alerts
}

export default function AlertBanner({ compact = false }) {
  const alerts = useAlerts()
  if (alerts.length === 0) return null

  const list = compact ? alerts.slice(0, 1) : alerts

  return (
    <div className="space-y-2">
      {list.map((al) => (
        <Banner key={al.key} {...al} />
      ))}
    </div>
  )
}
