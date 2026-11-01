import { useState, type SubmitEvent } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Confirme d’abord ton adresse grâce au lien reçu par email.',
  user_already_exists: 'Un compte existe déjà avec cet email : connecte-toi.',
  weak_password: 'Mot de passe trop faible : utilise au moins 6 caractères.',
  over_email_send_rate_limit: 'Trop d’emails envoyés. Réessaie dans quelques minutes.',
}

function describe(error: AuthError): string {
  return (error.code && AUTH_ERRORS[error.code]) || error.message
}

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(describe(error))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setError(describe(error))
      else if (!data.session) {
        setMessage('Compte créé ! Clique sur le lien reçu par email pour confirmer ton adresse, puis connecte-toi.')
        setMode('signin')
      }
    }
    setBusy(false)
  }

  return (
    <main className="auth-page">
      <form className="card stack auth-card" onSubmit={submit}>
        <div>
          <p className="brand">Mes révisions</p>
          <h1>{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</h1>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin' ? 'Pas encore de compte ? Inscris-toi' : 'Déjà un compte ? Connecte-toi'}
        </button>
      </form>
    </main>
  )
}
