// Les « jours » (échéances, prochaine révision) sont stockés au format AAAA-MM-JJ,
// calculés dans le fuseau horaire de l'utilisateur (et non en UTC).

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function today(): string {
  return toISODate(new Date())
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** Ex. : « mar. 3 nov. » (court) ou « mardi 3 novembre » (long) */
export function formatDay(iso: string, style: 'short' | 'long' = 'short'): string {
  return parseISODate(iso).toLocaleDateString('fr-FR', {
    weekday: style,
    day: 'numeric',
    month: style,
  })
}

/** Lundi de la semaine en cours, à minuit (heure locale). */
export function startOfWeek(now = new Date()): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysSinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)
  return date
}

/** Ex. : « 45 min », « 1 h 05 », « 2 h » */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** Pour trier par échéance, les éléments sans date en dernier. */
export function byDueDate(a: { due_date: string | null }, b: { due_date: string | null }): number {
  return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
}
