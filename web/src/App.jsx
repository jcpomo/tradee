import { useState, useEffect } from 'react'
import Navbar, { SCREENS } from './components/Navbar'
import Dashboard from './components/Dashboard'
import TradeCalculator from './components/TradeCalculator'
import TradeJournal from './components/TradeJournal'
import FloorTracker from './components/FloorTracker'
import ReferenceGuide from './components/ReferenceGuide'
import Settings from './components/Settings'
import { useAuth } from './store/useAuth'
import { useStore } from './store/useStore'
import AuthScreen from './components/AuthScreen'

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

  const authStatus = useAuth((s) => s.status)
  const bootstrap = useAuth((s) => s.bootstrap)
  const userEmail = useAuth((s) => s.user?.email)
  const logout = useAuth((s) => s.logout)
  const activeAccountId = useAuth((s) => s.activeAccountId)
  const hydrate = useStore((s) => s.hydrate)
  const hydrated = useStore((s) => s.hydrated)
  useEffect(() => { bootstrap() }, [bootstrap])
  useEffect(() => {
    if (authStatus === 'authenticated' && activeAccountId && !hydrated) hydrate(activeAccountId)
  }, [authStatus, activeAccountId, hydrated, hydrate])
  if (authStatus === 'loading') return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>
  if (authStatus === 'anonymous') return <AuthScreen />
  if (authStatus === 'authenticated' && !hydrated) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Cargando cuenta…</div>
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar
        screen={screen}
        onChange={setScreen}
        userEmail={userEmail}
        onLogout={logout}
      />

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
          Apex 50K Intraday Trailing Drawdown · Datos sincronizados con tu cuenta
        </p>
      </footer>
    </div>
  )
}
