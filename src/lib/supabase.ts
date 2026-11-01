import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Faux tant que .env.local n'est pas rempli : l'application affiche alors un écran d'aide.
export const isSupabaseConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'non-configuree')
