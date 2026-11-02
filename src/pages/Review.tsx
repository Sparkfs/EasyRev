import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import SubjectTag from '../components/SubjectTag'
import { addDays, today } from '../lib/dates'
import { schedule, type Grade } from '../lib/srs'
import { supabase } from '../lib/supabase'
import type { Flashcard } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 'again', label: 'À revoir', key: '1' },
  { grade: 'hard', label: 'Difficile', key: '2' },
  { grade: 'good', label: 'Bien', key: '3' },
  { grade: 'easy', label: 'Facile', key: '4' },
]

function intervalLabel(days: number): string {
  if (days === 0) return 'tout de suite'
  return days === 1 ? 'dans 1 jour' : `dans ${days} jours`
}

export default function Review() {
  const [params] = useSearchParams()
  const subjectFilter = params.get('matiere')
  const { subjects } = useSubjects()
  // File d'attente des cartes à réviser : la première est celle affichée.
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    let query = supabase.from('flashcards').select('*').lte('due_date', today())
    if (subjectFilter) query = query.eq('subject_id', subjectFilter)
    query.order('due_date').then(({ data, error }) => {
      if (ignore) return
      if (error) setError(error.message)
      else setQueue(data)
      setLoading(false)
    })
    return () => {
      ignore = true
    }
  }, [subjectFilter])

  const current = queue[0]

  async function rate(grade: Grade) {
    if (!current) return
    const next = schedule(current, grade)
    const updated = { ...current, ...next, due_date: addDays(today(), next.interval_days) }
    // On passe tout de suite à la carte suivante ; une carte ratée revient en fin de file.
    setQueue((q) => [...q.slice(1), ...(grade === 'again' ? [updated] : [])])
    setRevealed(false)
    setReviewedCount((n) => n + 1)

    const { error } = await supabase
      .from('flashcards')
      .update({
        repetitions: updated.repetitions,
        interval_days: updated.interval_days,
        ease: updated.ease,
        due_date: updated.due_date,
      })
      .eq('id', current.id)
    if (error) setError(`Une réponse n’a pas pu être enregistrée : ${error.message}`)
  }

  // Raccourcis clavier : Espace pour afficher la réponse, 1 à 4 pour noter.
  // (Sans tableau de dépendances : l'écouteur est recréé à chaque rendu et voit donc toujours l'état à jour.)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!current || event.ctrlKey || event.metaKey || event.altKey) return
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        setRevealed(true)
      } else if (revealed) {
        const match = GRADES.find((g) => g.key === event.key)
        if (match) rate(match.grade)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const subject = subjects.find((s) => s.id === (current?.subject_id ?? subjectFilter))

  return (
    <>
      <header className="page-header">
        <Link to="/flashcards" className="back-link">
          ← Flashcards
        </Link>
        <h1>Révision</h1>
        <p className="subtitle">
          {subjectFilter ? (subject?.name ?? 'Une matière') : 'Toutes les matières'}
          {current && ` · ${queue.length} ${queue.length > 1 ? 'cartes restantes' : 'carte restante'}`}
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      {current && (
        <div
          className="review-progress"
          role="progressbar"
          aria-label="Avancement de la révision"
          aria-valuemin={0}
          aria-valuemax={reviewedCount + queue.length}
          aria-valuenow={reviewedCount}
        >
          <div style={{ width: `${(reviewedCount / (reviewedCount + queue.length)) * 100}%` }} />
        </div>
      )}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : !current ? (
        <section className="card empty stack">
          <p className="big">{reviewedCount > 0 ? '🎉 Bravo !' : 'Rien à réviser pour le moment.'}</p>
          <p>
            {reviewedCount > 0
              ? `Tu as terminé ta révision (${reviewedCount} ${reviewedCount > 1 ? 'réponses' : 'réponse'}).`
              : 'Toutes tes cartes sont à jour. Reviens demain, ou ajoute de nouvelles cartes.'}
          </p>
          <div>
            <Link className="btn btn-primary" to="/">
              Retour au tableau de bord
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="card review-card" aria-live="polite">
            <SubjectTag subject={subjects.find((s) => s.id === current.subject_id)} />
            <p className="review-question pre-wrap">{current.front}</p>
            {revealed && <p className="review-answer pre-wrap">{current.back}</p>}
          </section>

          {revealed ? (
            <div className="grade-row">
              {GRADES.map(({ grade, label, key }) => (
                <button
                  key={grade}
                  className={`btn grade grade-${grade}`}
                  onClick={() => rate(grade)}
                  title={`Raccourci : ${key}`}
                >
                  <span>
                    {key} · {label}
                  </span>
                  <span className="grade-interval">{intervalLabel(schedule(current, grade).interval_days)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="center">
              <button className="btn btn-primary btn-large" onClick={() => setRevealed(true)}>
                Afficher la réponse
              </button>
              <p className="muted small">Raccourci : barre d’espace. Ensuite, touches 1 à 4 pour noter.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}
