import { describe, expect, it } from 'vitest'
import { addDays, byDueDate, formatDuration, startOfWeek } from './dates'
import { MIN_EASE, schedule, type CardSchedule } from './srs'

const newCard: CardSchedule = { repetitions: 0, interval_days: 0, ease: 2.5 }

describe('schedule', () => {
  it('espace les révisions quand on répond « Bien »', () => {
    const first = schedule(newCard, 'good')
    const second = schedule(first, 'good')
    const third = schedule(second, 'good')
    expect([first.interval_days, second.interval_days, third.interval_days]).toEqual([1, 6, 15])
    expect(third.repetitions).toBe(3)
  })

  it('remet la carte à zéro quand on répond « À revoir »', () => {
    const learned = { repetitions: 3, interval_days: 15, ease: 2.5 }
    expect(schedule(learned, 'again')).toEqual({ repetitions: 0, interval_days: 0, ease: 2.3 })
  })

  it('raccourcit avec « Difficile » et allonge avec « Facile »', () => {
    const learned = { repetitions: 2, interval_days: 6, ease: 2.5 }
    const hard = schedule(learned, 'hard')
    const good = schedule(learned, 'good')
    const easy = schedule(learned, 'easy')
    expect(hard.interval_days).toBeLessThan(good.interval_days)
    expect(easy.interval_days).toBeGreaterThan(good.interval_days)
    expect(easy.ease).toBe(2.65)
  })

  it("ne descend jamais sous la facilité minimale et garde au moins 1 jour d'intervalle", () => {
    let card = newCard
    for (let i = 0; i < 20; i++) card = schedule(card, 'hard')
    expect(card.ease).toBe(MIN_EASE)
    expect(schedule(newCard, 'hard').interval_days).toBe(1)
  })
})

describe('dates', () => {
  it('ajoute des jours en changeant de mois et d’année', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-30', 6)).toBe('2027-01-05')
  })

  it('trouve le lundi de la semaine', () => {
    expect(startOfWeek(new Date(2026, 10, 1, 15, 30))).toEqual(new Date(2026, 9, 26)) // dimanche → lundi 26 oct.
    expect(startOfWeek(new Date(2026, 9, 26, 8))).toEqual(new Date(2026, 9, 26))
  })

  it('formate les durées', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(65)).toBe('1 h 05')
    expect(formatDuration(120)).toBe('2 h')
  })

  it('trie par échéance avec les tâches sans date à la fin', () => {
    const tasks = [{ due_date: null }, { due_date: '2026-11-03' }, { due_date: '2026-11-01' }]
    expect(tasks.sort(byDueDate).map((t) => t.due_date)).toEqual(['2026-11-01', '2026-11-03', null])
  })
})
