import { useState, type FormEvent } from 'react'
import { supabase, isConfigured } from '../lib/supabase'
import { Button, ErrorText, Field, Input } from '../components/ui'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // shouldCreateUser: false → aucun compte ne peut être créé depuis l'app
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
    setBusy(false)
    // Même message si le compte n'existe pas : on ne révèle pas quelles adresses sont valides
    if (error && error.status !== 400 && error.status !== 422) setError(error.message)
    else setStep('code')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('Code invalide ou expiré.')
  }

  return (
    <div className="pt-safe flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <img src="/icon.svg" alt="" className="mx-auto mb-6 h-16 w-16" />
        <h1 className="mb-1 text-center text-2xl font-semibold">Studio de Louna</h1>
        <p className="mb-8 text-center text-muted">
          {step === 'email' ? 'Connexion par code envoyé par mail' : `Code envoyé à ${email}`}
        </p>

        {!isConfigured && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Supabase n'est pas configuré : renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
          </p>
        )}

        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <Field label="Adresse mail">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" className="w-full" disabled={busy || !email}>
              {busy ? 'Envoi…' : 'Recevoir un code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <Field label="Code à 6 chiffres" hint="Si l'adresse est autorisée, le code arrive dans quelques secondes.">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-[0.4em]"
              />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
              {busy ? 'Vérification…' : 'Se connecter'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep('email'); setCode('') }}>
              Changer d'adresse
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
