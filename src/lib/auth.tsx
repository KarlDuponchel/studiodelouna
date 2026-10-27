import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

type AuthState = { session: Session | null; loading: boolean; signOut: () => Promise<void> }

const AuthContext = createContext<AuthState>({ session: null, loading: true, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN') supabase.rpc('ensure_defaults').then(() => qc.invalidateQueries())
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const signOut = async () => {
    await supabase.auth.signOut()
    qc.clear()
    window.localStorage.removeItem('agenda-cache')
  }

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
