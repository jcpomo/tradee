import { useState, useEffect } from 'react'
import Navbar, { SCREENS } from './components/Navbar'
import Dashboard from './components/Dashboard'
import TradeCalculator from './components/TradeCalculator'
import TradeJournal from './components/TradeJournal'
import FloorTracker from './components/FloorTracker'
import ReferenceGuide from './components/ReferenceGuide'
import Settings from './components/Settings'

const VALID = SCREENS.map((s) => s.id)

export default function App() {
  const [screen, setScreen] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    return VALID.includes(hash) ? hash : 'dashboard'
  })

  // El hash permite recargar la página y volver a la misma pantalla
  useEffect(() => {
    window.location.hash = screen
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [screen])

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (VALID.includes(hash)) setScreen(hash)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="min-h-screen bg-bg">
      <Navbar screen={screen} onChange={setScreen} />

      <main className="mx-auto max-w-7xl px-4 py-4 pb-24 md:pb-8">
        {screen === 'dashboard' && <Dashboard onNavigate={setScreen} />}
        {screen === 'calculator' && <TradeCalculator onNavigate={setScreen} />}
        {screen === 'journal' && <TradeJournal onNavigate={setScreen} />}
        {screen === 'floor' && <FloorTracker onNavigate={setScreen} />}
        {screen === 'reference' && <ReferenceGuide onNavigate={setScreen} />}
        {screen === 'settings' && <Settings onNavigate={setScreen} />}
      </main>

      <footer className="border-t border-border py-6 text-center md:block hidden">
        <p className="text-[11px] text-muted">
          Apex 50K Intraday Trailing Drawdown · Datos guardados solo en este navegador (localStorage)
        </p>
      </footer>
    </div>
  )
}
