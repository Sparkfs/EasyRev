// Répétition espacée, inspirée de l'algorithme SM-2 (celui d'Anki).
// Chaque carte retient :
//  - repetitions   : nombre de bonnes réponses d'affilée
//  - interval_days : nombre de jours avant la prochaine révision
//  - ease          : « facilité » ; plus elle est haute, plus les intervalles grandissent vite
// Plus tu connais une carte, moins tu la revois souvent.

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface CardSchedule {
  repetitions: number
  interval_days: number
  ease: number
}

export const MIN_EASE = 1.3

const EASE_CHANGE: Record<Grade, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }
const INTERVAL_MULTIPLIER: Record<Exclude<Grade, 'again'>, number> = { hard: 0.5, good: 1, easy: 1.5 }

export function schedule(card: CardSchedule, grade: Grade): CardSchedule {
  const ease = Math.max(MIN_EASE, Math.round((card.ease + EASE_CHANGE[grade]) * 100) / 100)

  if (grade === 'again') {
    // Carte ratée : on repart de zéro et elle revient aujourd'hui.
    return { repetitions: 0, interval_days: 0, ease }
  }

  // 1 jour après la 1re réussite, 6 jours après la 2e, puis l'intervalle est multiplié par la facilité.
  const base = card.repetitions === 0 ? 1 : card.repetitions === 1 ? 6 : card.interval_days * ease
  return {
    repetitions: card.repetitions + 1,
    interval_days: Math.max(1, Math.round(base * INTERVAL_MULTIPLIER[grade])),
    ease,
  }
}
