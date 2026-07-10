import { useId, useState } from 'react'
import { api } from '../api.js'

export default function Login({ onLogin }) {
  const uid = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { user } = await api.login(username, password)
      onLogin(user)
    } catch (err) {
      setError(
        err?.status === 429 ? 'Trop de tentatives, réessaie dans quelques minutes.' : 'Identifiants incorrects.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="dot" />
          Timeline
        </div>
        <p className="login-sub">Espace collaboratif Vibaura</p>

        <div className="field">
          <label htmlFor={`${uid}-user`}>Identifiant</label>
          <input
            id={`${uid}-user`}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-pass`}>Mot de passe</label>
          <input
            id={`${uid}-pass`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
