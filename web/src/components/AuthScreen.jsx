import { useState } from 'react'
import { useAuth } from '../store/useAuth'
import { Section, Field, NoteBox } from './ui'
export default function AuthScreen() {
  const login = useAuth((s) => s.login), register = useAuth((s) => s.register)
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState(null), [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setError(null); setBusy(true)
    try { mode === 'login' ? await login(email, password) : await register(email, password) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 border border-gold/40"><span className="text-gold font-black">A</span></div>
          <h1 className="text-lg font-bold text-slate-100">Apex Dashboard</h1>
        </div>
        <Section title={mode === 'login' ? 'Entrar' : 'Crear cuenta'}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Contraseña" hint="Mínimo 8 caracteres"><input type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <NoteBox tone="red">{error}</NoteBox>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? '...' : mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
          </form>
          <button className="mt-4 w-full text-xs text-muted hover:text-gold" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>
            {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
          </button>
        </Section>
      </div>
    </div>
  )
}
