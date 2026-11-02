import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import QuestionCard from '../components/QuestionCard'
import StatusBadge from '../components/StatusBadge'
import SubjectTag from '../components/SubjectTag'
import { KIND_LABELS, questionToFlashcard, startAnalysis } from '../lib/assistant'
import { today } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Question, QuestionKind, StudyDocument } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

/** Au-delà de ce délai sans nouvelle, on considère que l'analyse s'est interrompue. */
const STUCK_AFTER_MS = 4 * 60_000

export default function DocumentView() {
  const { id = '' } = useParams()
  const { subjects } = useSubjects()
  const [doc, setDoc] = useState<StudyDocument | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'explication' | 'questions'>('explication')
  const [kindFilter, setKindFilter] = useState<QuestionKind | ''>('')
  // Résultats de l'entraînement en cours : id de la question → juste ou non.
  const [results, setResults] = useState<Record<string, boolean>>({})
  // Changer cette valeur relance le chargement (après « Relancer l'analyse ») ou remet les questions à zéro.
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  // Charge le document ; tant que l'IA travaille, recharge toutes les 4 secondes.
  useEffect(() => {
    let ignore = false
    let timer: number | undefined
    async function load() {
      const { data, error } = await supabase.from('documents').select('*').eq('id', id).single()
      if (ignore) return
      if (error) {
        setError(error.message)
        return
      }
      setDoc(data)
      setNow(Date.now())
      if (data.status === 'pending') {
        timer = window.setTimeout(load, 4000)
      } else if (data.status === 'ready') {
        const response = await supabase.from('questions').select('*').eq('document_id', id).order('position')
        if (ignore) return
        if (response.error) setError(response.error.message)
        else setQuestions(response.data)
      }
    }
    load()
    return () => {
      ignore = true
      window.clearTimeout(timer)
    }
  }, [id, reloadKey])

  async function retry() {
    if (!doc) return
    setError(null)
    setDoc({ ...doc, status: 'pending', error: null, updated_at: new Date().toISOString() })
    await startAnalysis(doc.id)
    setReloadKey((k) => k + 1)
  }

  async function addToFlashcards(list: Question[]) {
    if (!doc) return
    const toAdd = list.filter((q) => !q.added_to_flashcards)
    if (toAdd.length === 0) return
    const { error } = await supabase
      .from('flashcards')
      .insert(toAdd.map((q) => ({ ...questionToFlashcard(q), subject_id: doc.subject_id, due_date: today() })))
    if (error) {
      setError(error.message)
      return
    }
    const ids = toAdd.map((q) => q.id)
    await supabase.from('questions').update({ added_to_flashcards: true }).in('id', ids)
    setQuestions(questions.map((q) => (ids.includes(q.id) ? { ...q, added_to_flashcards: true } : q)))
  }

  function restartPractice() {
    setResults({})
    setReloadKey((k) => k + 1)
  }

  const subject = subjects.find((s) => s.id === doc?.subject_id)
  const header = (
    <header className="page-header">
      <Link to="/documents" className="back-link">
        ← Documents
      </Link>
      <h1>{doc?.title ?? 'Document'}</h1>
      {doc && (
        <p className="row subtitle">
          <SubjectTag subject={subject} />
          <StatusBadge status={doc.status} />
          {doc.file_name && <span className="muted small">{doc.file_name}</span>}
        </p>
      )}
    </header>
  )

  if (!doc) {
    return (
      <>
        {header}
        {error ? <p className="error">{error}</p> : <p className="muted">Chargement…</p>}
      </>
    )
  }

  if (doc.status === 'pending') {
    const stuck = now - new Date(doc.updated_at).getTime() > STUCK_AFTER_MS
    return (
      <>
        {header}
        <section className="card empty stack">
          {stuck ? (
            <>
              <p className="big">L’analyse semble interrompue.</p>
              <div>
                <button className="btn btn-primary" onClick={retry}>
                  Relancer l’analyse
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="spinner" aria-hidden="true" />
              <p className="big">L’assistant lit ton document…</p>
              <p>
                Il prépare une explication et {doc.question_count} questions corrigées. Cela prend en général
                entre 30 secondes et 2 minutes. Tu peux quitter cette page, l’analyse continue.
              </p>
            </>
          )}
        </section>
      </>
    )
  }

  if (doc.status === 'error') {
    return (
      <>
        {header}
        <section className="card stack">
          <h2 className="danger-text">⚠ L’analyse a échoué</h2>
          <p className="error pre-wrap">{doc.error ?? 'Erreur inconnue.'}</p>
          <div>
            <button className="btn btn-primary" onClick={retry}>
              Relancer l’analyse
            </button>
          </div>
        </section>
      </>
    )
  }

  const visibleQuestions = kindFilter ? questions.filter((q) => q.kind === kindFilter) : questions
  const answered = Object.keys(results).length
  const correct = Object.values(results).filter(Boolean).length
  const kindsPresent = [...new Set(questions.map((q) => q.kind))]

  return (
    <>
      {header}
      {error && <p className="error">{error}</p>}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'explication'}
          className={tab === 'explication' ? 'tab active' : 'tab'}
          onClick={() => setTab('explication')}
        >
          Explication
        </button>
        <button
          role="tab"
          aria-selected={tab === 'questions'}
          className={tab === 'questions' ? 'tab active' : 'tab'}
          onClick={() => setTab('questions')}
        >
          Questions <span className="count">{questions.length}</span>
        </button>
      </div>

      {tab === 'explication' ? (
        <>
          {doc.summary && (
            <section className="card stack">
              <h2>En bref</h2>
              <p className="pre-wrap">{doc.summary}</p>
            </section>
          )}
          {doc.key_points && doc.key_points.length > 0 && (
            <section className="card">
              <h2>Les notions clés</h2>
              <ul className="key-points">
                {doc.key_points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </section>
          )}
          {doc.sections?.map((section, i) => (
            <section key={i} className="card stack prose">
              <h2>{section.title}</h2>
              {section.content.split(/\n\s*\n/).map((paragraph, j) => (
                <p key={j} className="pre-wrap">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          {doc.glossary && doc.glossary.length > 0 && (
            <section className="card">
              <h2>Vocabulaire</h2>
              <dl className="glossary">
                {doc.glossary.map((entry, i) => (
                  <div key={i}>
                    <dt>{entry.term}</dt>
                    <dd>{entry.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <div className="center">
            <button className="btn btn-primary btn-large" onClick={() => setTab('questions')}>
              Passer aux questions →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as QuestionKind | '')}
              aria-label="Type de questions"
            >
              <option value="">Tous les types</option>
              {kindsPresent.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <div className="row">
              <span className="score">
                Score : {correct} / {answered}
              </span>
              <button className="btn btn-ghost btn-small" onClick={restartPractice} disabled={answered === 0}>
                Recommencer
              </button>
              <button
                className="btn btn-small"
                onClick={() => addToFlashcards(visibleQuestions)}
                disabled={visibleQuestions.every((q) => q.added_to_flashcards)}
              >
                + Tout ajouter aux flashcards
              </button>
            </div>
          </div>

          {visibleQuestions.map((question) => (
            <QuestionCard
              key={`${question.id}-${reloadKey}`}
              question={question}
              number={questions.indexOf(question) + 1}
              onResult={(isCorrect) => setResults((r) => ({ ...r, [question.id]: isCorrect }))}
              onAddFlashcard={() => addToFlashcards([question])}
            />
          ))}
        </>
      )}
    </>
  )
}
