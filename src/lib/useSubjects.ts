import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Subject } from './types'

/** Charge les matières de l'utilisateur, triées par nom. */
export function useSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    supabase
      .from('subjects')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (ignore) return
        if (error) setError(error.message)
        else setSubjects(data)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  return { subjects, setSubjects, loading, error }
}
