import { useState, type SubmitEvent } from 'react'
import { SUBJECT_COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import type { Subject } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

export default function Subjects() {
  const { subjects, setSubjects, loading, error: loadError } = useSubjects()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Tant que tu n'as rien choisi, on propose la première couleur pas encore utilisée.
  const firstUnusedColor = SUBJECT_COLORS.find((c) => !subjects.some((s) => s.color === c.value))
  const selectedColor = color ?? firstUnusedColor?.value ?? SUBJECT_COLORS[0].value

  async function addSubject(event: SubmitEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const { data, error } = await supabase
      .from('subjects')
      .insert({ name: trimmed, color: selectedColor })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setSubjects([...subjects, data].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    setName('')
    setColor(null)
    setError(null)
  }

  async function deleteSubject(subject: Subject) {
    const confirmed = confirm(
      `Supprimer « ${subject.name} » ? Ses flashcards et ses tâches seront aussi supprimées.`,
    )
    if (!confirmed) return
    const { error } = await supabase.from('subjects').delete().eq('id', subject.id)
    if (error) {
      setError(error.message)
      return
    }
    setSubjects(subjects.filter((s) => s.id !== subject.id))
  }

  return (
    <>
      <header className="page-header">
        <h1>Matières</h1>
        <p className="subtitle">Range tes flashcards et tes tâches par matière.</p>
      </header>

      <form className="card stack" onSubmit={addSubject}>
        <label className="field">
          <span>Nom de la matière</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : Mathématiques"
            maxLength={80}
            required
          />
        </label>
        <fieldset className="field">
          <legend>Couleur</legend>
          <div className="swatches">
            {SUBJECT_COLORS.map((c) => (
              <label key={c.value} className="swatch" title={c.name}>
                <input
                  type="radio"
                  name="color"
                  value={c.value}
                  checked={selectedColor === c.value}
                  onChange={() => setColor(c.value)}
                  aria-label={c.name}
                />
                <span style={{ background: c.value }} />
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <button className="btn btn-primary">Ajouter la matière</button>
        </div>
      </form>

      {(error ?? loadError) && <p className="error">{error ?? loadError}</p>}

      <section className="card">
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : subjects.length === 0 ? (
          <p className="empty">Aucune matière pour l’instant. Ajoute ta première matière ci-dessus.</p>
        ) : (
          <ul className="list">
            {subjects.map((subject) => (
              <li key={subject.id} className="list-item">
                <span className="dot dot-large" style={{ background: subject.color }} />
                <span className="grow">{subject.name}</span>
                <button className="btn btn-ghost btn-small" onClick={() => deleteSubject(subject)}>
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
