import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/**
 * Double authentification obligatoire :
 * - enroll : connectée par mail, aucune app d'authentification enregistrée
 * - challenge : app enregistrée, code pas encore saisi pour cette session
 * - ok : session au niveau aal2, les données sont accessibles (voir 0004_require_mfa.sql)
 */
export type MfaState = 'loading' | 'enroll' | 'challenge' | 'ok'

type AuthState = {
  session: Session | null
  loading: boolean
  mfa: MfaState
  /** À appeler après une vérification de code pour mettre à jour `mfa` */
  refreshMfa: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  mfa: 'loading',
  refreshMfa: async () => {},
  signOut: async () => {},
})

async function readMfaState(): Promise<MfaState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return 'enroll'
  if (data.currentLevel === 'aal2') return 'ok'
  return data.nextLevel === 'aal2' ? 'challenge' : 'enroll'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfa, setMfa] = useState<MfaState>('loading')
  const defaultsDone = useRef(false)
  const qc = useQueryClient()

  const refreshMfa = useCallback(async () => {
    setMfa(await readMfaState())
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Le niveau 2FA se lit dans le jeton : on le recalcule à chaque changement de session
  useEffect(() => {
    if (!session) {
      setMfa('loading')
      return
    }
    // Hors du callback onAuthStateChange : y appeler l'API auth peut bloquer le client
    readMfaState().then(setMfa)
  }, [session])

  // Valeurs par défaut une fois la session au niveau aal2 (avant, la base refuse tout)
  useEffect(() => {
    if (mfa !== 'ok' || defaultsDone.current) return
    defaultsDone.current = true
    supabase.rpc('ensure_defaults').then(() => qc.invalidateQueries())
  }, [mfa, qc])

  const signOut = async () => {
    await supabase.auth.signOut()
    defaultsDone.current = false
    qc.clear()
    window.localStorage.removeItem('agenda-cache')
  }

  return <AuthContext.Provider value={{ session, loading, mfa, refreshMfa, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
