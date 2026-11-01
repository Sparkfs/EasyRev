import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link } from 'react-router'
import SubjectSelect from '../components/SubjectSelect'
import SubjectTag from '../components/SubjectTag'
import { formatDay, today } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Flashcard } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

export default function Flashcards() {
  const { subjects, loading: subjectsLoading } = useSubjects()
  const [cards, setCards] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<Flashcard | null>(null)
  const [subjectId, setSubjectId] = useState('')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [error, setError] = useState<string | null>(null)
  const frontInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let ignore = false
    supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (ignore) return
        if (error) setError(error.message)
        else setCards(data)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const visibleCards = filter ? cards.filter((c) => c.subject_id === filter) : cards
  const day = today()
  const dueCount = visibleCards.filter((c) => c.due_date <= day).length
  // Matière du formulaire : celle choisie, sinon celle du filtre, sinon la première.
  const formSubjectId = subjectId || filter || subjects[0]?.id || ''

  function resetForm() {
    setEditing(null)
    setFront('')
    setBack('')
    setError(null)
  }

  function startEditing(card: Flashcard) {
    setEditing(card)
    setSubjectId(card.subject_id)
    setFront(card.front)
    setBack(card.back)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    frontInput.current?.focus({ preventScroll: true })
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    const values = { subject_id: formSubjectId, front: front.trim(), back: back.trim() }
    if (!values.subject_id || !values.front || !values.back) return

    if (editing) {
      const { data, error } = await supabase
        .from('flashcards')
        .update(values)
        .eq('id', editing.id)
        .select()
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setCards(cards.map((c) => (c.id === data.id ? data : c)))
    } else {
      const { data, error } = await supabase
        .from('flashcards')
        .insert({ ...values, due_date: today() })
        .select()
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setCards([data, ...cards])
    }
    resetForm()
    frontInput.current?.focus()
  }

  async function deleteCard(card: Flashcard) {
    if (!confirm('Supprimer cette carte ?')) return
    const { error } = await supabase.from('flashcards').delete().eq('id', card.id)
    if (error) {
      setError(error.message)
      return
    }
    setCards(cards.filter((c) => c.id !== card.id))
    if (editing?.id === card.id) resetForm()
  }

  if (!subjectsLoading && subjects.length === 0) {
    return (
      <>
        <header className="page-header">
          <h1>Flashcards</h1>
        </header>
        <section className="card empty">
          <p>Crée d’abord une matière pour y ranger tes cartes.</p>
          <Link className="btn btn-primary" to="/matieres">
            Créer une matière
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      <header className="page-header">
        <h1>Flashcards</h1>
        <p className="subtitle">
          Écris une question et sa réponse. Le site te les reproposera au bon moment pour les mémoriser.
        </p>
      </header>

      <div className="toolbar">
        <SubjectSelect subjects={subjects} value={filter} onChange={setFilter} emptyLabel="Toutes les matières" />
        {dueCount > 0 ? (
          <Link className="btn btn-primary" to={filter ? `/reviser?matiere=${filter}` : '/reviser'}>
            Réviser ({dueCount} {dueCount > 1 ? 'cartes' : 'carte'})
          </Link>
        ) : (
          !loading && <span className="muted">Aucune carte à réviser aujourd’hui</span>
        )}
      </div>

      <form className="card stack" onSubmit={save}>
        <h2>{editing ? 'Modifier la carte' : 'Nouvelle carte'}</h2>
        <label className="field">
          <span>Matière</span>
          <SubjectSelect subjects={subjects} value={formSubjectId} onChange={setSubjectId} />
        </label>
        <label className="field">
          <span>Question (recto)</span>
          <textarea ref={frontInput} value={front} onChange={(e) => setFront(e.target.value)} rows={2} required />
        </label>
        <label className="field">
          <span>Réponse (verso)</span>
          <textarea value={back} onChange={(e) => setBack(e.target.value)} rows={3} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn btn-primary">{editing ? 'Enregistrer' : 'Ajouter la carte'}</button>
          {editing && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Annuler
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <h2>
          Mes cartes <span className="count">{visibleCards.length}</span>
        </h2>
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : visibleCards.length === 0 ? (
          <p className="empty">Aucune carte pour l’instant.</p>
        ) : (
          <ul className="list">
            {visibleCards.map((card) => (
              <li key={card.id} className="list-item list-item-top">
                <div className="grow stack-tight">
                  <strong className="pre-wrap">{card.front}</strong>
                  <span className="muted pre-wrap">{card.back}</span>
                  <span className="row small">
                    <SubjectTag subject={subjectById.get(card.subject_id)} />
                    <span className="muted">
                      Prochaine révision : {card.due_date <= day ? 'aujourd’hui' : formatDay(card.due_date)}
                    </span>
                  </span>
                </div>
                <div className="row">
                  <button className="btn btn-ghost btn-small" onClick={() => startEditing(card)}>
                    Modifier
                  </button>
                  <button className="btn btn-ghost btn-small" onClick={() => deleteCard(card)}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
