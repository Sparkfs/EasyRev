import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Session de l'utilisateur connecté : `undefined` pendant le chargement, `null` si déconnecté. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  return session
}
