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
import { useAccounts } from './store/useAccounts'
import AuthScreen from './components/AuthScreen'
import { NoteBox } from './components/ui'
import { hasLegacyData, migrateLegacyData } from './api/migrateLocal'

const VALID = SCREENS.map((s) => s.id)

export default function App() {
  const [screen, setScreen] = useState(() => {
    const hash = window.location.hash.replace('#', '')
    return VALID.includes(hash) ? hash : 'dashboard'
  })
  const [legacyDataAvailable, setLegacyDataAvailable] = useState(false)
  const [showNewAccount, setShowNewAccount] = useState(false)

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

  useEffect(() => {
    if (hasLegacyData()) setLegacyDataAvailable(true)
  }, [])

  const authStatus = useAuth((s) => s.status)
  const bootstrap = useAuth((s) => s.bootstrap)
  const userEmail = useAuth((s) => s.user?.email)
  const logout = useAuth((s) => s.logout)
  const activeAccountId = useAuth((s) => s.activeAccountId)
  const hydrate = useStore((s) => s.hydrate)
  const hydrated = useStore((s) => s.hydrated)
  const loadAccounts = useAccounts((s) => s.load)

  const handleMigrate = async () => {
    if (!activeAccountId) return
    try {
      await migrateLegacyData(activeAccountId)
      await hydrate(activeAccountId)
      setLegacyDataAvailable(false)
    } catch (err) {
      console.error('Migration failed:', err)
    }
  }

  useEffect(() => { bootstrap() }, [bootstrap])
  useEffect(() => {
    if (authStatus === 'authenticated' && activeAccountId && !hydrated) hydrate(activeAccountId)
  }, [authStatus, activeAccountId, hydrated, hydrate])
  useEffect(() => {
    if (authStatus === 'authenticated' && hydrated) loadAccounts()
  }, [authStatus, hydrated, loadAccounts])
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
        onNewAccount={() => setShowNewAccount(true)}
      />

      {/* TODO (Task 3.3): reemplazar por <NewAccountModal onClose={() => setShowNewAccount(false)} /> */}
      {showNewAccount && null}

      <main className="mx-auto max-w-7xl px-4 py-4 pb-24 md:pb-8">
        {legacyDataAvailable && (
          <div className="mb-4">
            <NoteBox tone="blue">
              <div className="flex items-center justify-between gap-3">
                <span>Tienes datos anteriores disponibles. ¿Deseas importarlos a tu cuenta?</span>
                <button
                  onClick={handleMigrate}
                  className="px-3 py-1.5 text-xs font-semibold bg-info hover:bg-info/80 text-black rounded-md whitespace-nowrap transition-colors"
                >
                  Importar mis datos anteriores
                </button>
              </div>
            </NoteBox>
          </div>
        )}
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
