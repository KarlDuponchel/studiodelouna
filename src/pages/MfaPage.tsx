import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Copy, KeyRound, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, ErrorText, Field, Input } from '../components/ui'

/** Écran affiché après le code mail tant que la session n'est pas au niveau 2FA */
export default function MfaPage() {
  const { mfa } = useAuth()
  return mfa === 'enroll' ? <Enroll /> : <Challenge />
}

function Shell({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  const { signOut } = useAuth()
  return (
    <div className="pt-safe flex min-h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
        <h1 className="mb-1 text-center text-2xl font-semibold">{title}</h1>
        <p className="mb-8 text-center text-muted">{subtitle}</p>
        {children}
        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={signOut}>
          Se déconnecter
        </Button>
      </div>
    </div>
  )
}

function CodeForm({ factorId, submitLabel }: { factorId: string | null; submitLabel: string }) {
  const { refreshMfa } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    setBusy(false)
    if (error) {
      setError('Code invalide. Vérifier que l\'heure du téléphone est à jour, puis réessayer avec le code suivant.')
      setCode('')
      return
    }
    await refreshMfa()
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <Field label="Code à 6 chiffres de l'app d'authentification">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center text-2xl tracking-[0.4em]"
        />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" className="w-full" disabled={busy || !factorId || code.length < 6}>
        {busy ? 'Vérification…' : submitLabel}
      </Button>
    </form>
  )
}

function Challenge() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) setError(error.message)
      else setFactorId(data.totp[0]?.id ?? null)
    })
  }, [])

  return (
    <Shell icon={<ShieldCheck size={32} />} title="Double authentification" subtitle="Saisir le code affiché dans l'app d'authentification">
      <ErrorText error={error} />
      <CodeForm factorId={factorId} submitLabel="Valider" />
    </Shell>
  )
}

type Enrollment = { id: string; qr: string; secret: string; uri: string }

function Enroll() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    // Une seule inscription, même si l'effet est rejoué (StrictMode)
    if (started.current) return
    started.current = true
    ;(async () => {
      // Une inscription abandonnée bloque la suivante : on la supprime d'abord
      const { data: factors } = await supabase.auth.mfa.listFactors()
      for (const f of factors?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Studio de Louna' })
      if (error) return setError(error.message)
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri })
    })()
  }, [])

  async function copySecret() {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers refusé : la clé reste lisible à l'écran
    }
  }

  return (
    <Shell
      icon={<KeyRound size={32} />}
      title="Activer la double authentification"
      subtitle="Obligatoire pour accéder à l'agenda. À faire une seule fois par compte."
    >
      <ErrorText error={error} />
      {enrollment && (
        <div className="pop-in space-y-6">
          <ol className="space-y-5">
            <li className="space-y-3">
              <p className="text-sm">
                <span className="font-semibold">1.</span> Ajouter le compte à une app d'authentification (Mots de passe d'iOS, Google Authenticator…)
              </p>
              {/* Sur iPhone : le lien otpauth ouvre directement l'app ; ailleurs : scanner le QR code */}
              <a
                href={enrollment.uri}
                className="flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-medium text-white transition active:scale-[0.98] md:hidden"
              >
                Ajouter à l'app d'authentification
              </a>
              <img src={enrollment.qr} alt="QR code à scanner avec l'app d'authentification" className="mx-auto hidden h-48 w-48 rounded-xl bg-white p-2 md:block" />
              <details className="text-sm text-muted">
                <summary className="cursor-pointer">Saisir la clé à la main</summary>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-2 font-mono text-xs break-all text-ink">{enrollment.secret}</code>
                  <button type="button" onClick={copySecret} aria-label="Copier la clé" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-accent-soft active:scale-90">
                    {copied ? <Check size={18} className="text-accent" /> : <Copy size={18} />}
                  </button>
                </div>
              </details>
            </li>
            <li className="space-y-3">
              <p className="text-sm">
                <span className="font-semibold">2.</span> Saisir le code à 6 chiffres qu'elle affiche
              </p>
              <CodeForm factorId={enrollment.id} submitLabel="Activer" />
            </li>
          </ol>
        </div>
      )}
    </Shell>
  )
}
