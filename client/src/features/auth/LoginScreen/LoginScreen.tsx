import { useId, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { api } from '../../../api'
import { isApiError } from '../../../api/client'
import { Button } from '../../../ui/Button/Button'
import { Field } from '../../../ui/Field/Field'
import { FormError } from '../../../ui/FormError/FormError'
import s from './LoginScreen.module.css'

export interface LoginScreenProps {
  onLogin: (user: string) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const uid = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { user } = await api.login(username, password)
      onLogin(user)
    } catch (err) {
      setError(
        isApiError(err) && err.status === 429
          ? 'Trop de tentatives, réessaie dans quelques minutes.'
          : 'Identifiants incorrects.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.screen}>
      <form className={s.card} onSubmit={submit}>
        <div className={s.brand}>
          <span className={s.dot} />
          Timeline
        </div>
        <p className={s.sub}>Espace collaboratif Vibaura</p>

        <Field label="Identifiant" htmlFor={`${uid}-user`}>
          <input
            id={`${uid}-user`}
            autoFocus
            value={username}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </Field>
        <Field label="Mot de passe" htmlFor={`${uid}-pass`}>
          <input
            id={`${uid}-pass`}
            type="password"
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <Button variant="primary" block disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </div>
  )
}
