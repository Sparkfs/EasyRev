import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import SubjectSelect from '../components/SubjectSelect'
import StatusBadge from '../components/StatusBadge'
import SubjectTag from '../components/SubjectTag'
import { startAnalysis } from '../lib/assistant'
import { buildClaudePrompt, CLAUDE_URL, parseClaudeAnswer } from '../lib/claudeImport'
import { formatDay, toISODate } from '../lib/dates'
import { ACCEPTED_FILES, cleanText, extractText, MAX_CHARACTERS, MIN_CHARACTERS } from '../lib/extractText'
import { supabase } from '../lib/supabase'
import type { StudyDocument } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

type DocumentSummary = Pick<StudyDocument, 'id' | 'title' | 'file_name' | 'subject_id' | 'status' | 'created_at'>

const QUESTION_COUNTS = [8, 12, 16, 20]

type Source = 'file' | 'text' | 'claude'

const SOURCES: { value: Source; label: string }[] = [
  { value: 'file', label: 'Envoyer un fichier' },
  { value: 'text', label: 'Coller du texte' },
  { value: 'claude', label: 'Avec mon abonnement Claude' },
]

/** Contenu enregistré pour un document analysé dans claude.ai (son texte n'arrive pas jusqu'au site). */
const CLAUDE_PLACEHOLDER = 'Document analysé directement dans Claude (claude.ai) : son texte n’a pas été importé.'

export default function Documents() {
  const { subjects, loading: subjectsLoading } = useSubjects()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<Source>('file')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [claudeAnswer, setClaudeAnswer] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [questionCount, setQuestionCount] = useState(12)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const hasPending = documents.some((d) => d.status === 'pending')

  // Charge la liste, puis la recharge toutes les 5 secondes tant qu'une analyse est en cours.
  useEffect(() => {
    let ignore = false
    let timer: number | undefined
    async function load() {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, file_name, subject_id, status, created_at')
        .order('created_at', { ascending: false })
      if (ignore) return
      if (error) setError(error.message)
      else {
        setDocuments(data)
        if (data.some((d) => d.status === 'pending')) timer = window.setTimeout(load, 5000)
      }
      setLoading(false)
    }
    load()
    return () => {
      ignore = true
      window.clearTimeout(timer)
    }
  }, [hasPending])

  const formSubjectId = subjectId || subjects[0]?.id || ''

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildClaudePrompt(questionCount))
      setPromptCopied(true)
    } catch {
      setError('Impossible de copier automatiquement. Sélectionne la consigne affichée et copie-la (Ctrl+C).')
    }
  }

  /** Crée le document et ses questions à partir de la réponse collée depuis claude.ai. */
  async function importFromClaude() {
    setProgress('Import de la réponse de Claude…')
    const analysis = parseClaudeAnswer(claudeAnswer)
    const { data, error } = await supabase
      .from('documents')
      .insert({
        subject_id: formSubjectId,
        title: title.trim() || `Cours analysé avec Claude – ${formatDay(toISODate(new Date()))}`,
        content: CLAUDE_PLACEHOLDER,
        question_count: Math.min(30, Math.max(4, analysis.questions.length)),
        status: 'ready',
        summary: analysis.summary,
        key_points: analysis.key_points,
        sections: analysis.sections,
        glossary: analysis.glossary,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(analysis.questions.map((q, position) => ({ ...q, document_id: data.id, position })))
    if (questionsError) {
      await supabase.from('documents').delete().eq('id', data.id)
      throw new Error(questionsError.message)
    }
    navigate(`/documents/${data.id}`)
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    try {
      if (source === 'claude') {
        await importFromClaude()
        return
      }
      setProgress('Lecture du document…')
      const text = source === 'file' ? (file ? await extractText(file) : '') : cleanText(pastedText)
      if (text.length < MIN_CHARACTERS) {
        throw new Error(
          source === 'file'
            ? 'Ce document ne contient presque pas de texte. S’il s’agit d’un PDF scanné (une image), ' +
              'copie plutôt le texte dans l’onglet « Coller du texte ».'
            : `Colle un texte plus long (au moins ${MIN_CHARACTERS} caractères).`,
        )
      }

      setProgress('Envoi à l’assistant IA…')
      const { data, error } = await supabase
        .from('documents')
        .insert({
          subject_id: formSubjectId,
          title: title.trim() || file?.name.replace(/\.[^.]+$/, '') || `Texte du ${formatDay(toISODate(new Date()))}`,
          file_name: source === 'file' ? file?.name : null,
          content: text.slice(0, MAX_CHARACTERS),
          question_count: questionCount,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      // Même en cas d'erreur, on ouvre la page du document : elle affiche le problème et propose de réessayer.
      await startAnalysis(data.id)
      navigate(`/documents/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setProgress(null)
    }
  }

  async function deleteDocument(doc: DocumentSummary) {
    if (!confirm(`Supprimer « ${doc.title} » et ses questions ?`)) return
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) {
      setError(error.message)
      return
    }
    setDocuments(documents.filter((d) => d.id !== doc.id))
  }

  if (!subjectsLoading && subjects.length === 0) {
    return (
      <>
        <header className="page-header">
          <h1>Documents</h1>
        </header>
        <section className="card empty">
          <p>Crée d’abord une matière pour y ranger tes documents.</p>
          <Link className="btn btn-primary" to="/matieres">
            Créer une matière
          </Link>
        </section>
      </>
    )
  }

  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  return (
    <>
      <header className="page-header">
        <h1>Documents</h1>
        <p className="subtitle">
          Envoie un cours : l’assistant IA te l’explique et prépare des questions corrigées pour t’entraîner.
        </p>
      </header>

      <form className="card stack" onSubmit={submit}>
        <div className="tabs" role="tablist">
          {SOURCES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={source === value}
              className={source === value ? 'tab active' : 'tab'}
              onClick={() => {
                setSource(value)
                setError(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'claude' ? (
          <p className="muted small">
            Pas de clé ni de frais en plus : tu fais analyser ton cours sur claude.ai, puis tu recolles la réponse ici.
            Claude lit directement tes PDF, formules et schémas compris.
          </p>
        ) : source === 'file' ? (
          <label className="field">
            <span>Fichier (PDF, Word .docx ou texte .txt)</span>
            <input
              type="file"
              accept={ACCEPTED_FILES}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
        ) : (
          <label className="field">
            <span>Texte du cours</span>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={8}
              placeholder="Colle ici le contenu de ton cours…"
              required
            />
          </label>
        )}

        <div className="settings-grid">
          <label className="field">
            <span>Titre (facultatif)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Chapitre 3 – Les fonctions" maxLength={200} />
          </label>
          <label className="field">
            <span>Matière</span>
            <SubjectSelect subjects={subjects} value={formSubjectId} onChange={setSubjectId} />
          </label>
          <label className="field">
            <span>Nombre de questions</span>
            <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
              {QUESTION_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </label>
        </div>

        {source === 'claude' && (
          <ol className="claude-steps">
            <li>
              <span>Choisis la matière et le nombre de questions ci-dessus, puis copie la consigne :</span>
              <span className="row">
                <button type="button" className="btn btn-small" onClick={copyPrompt}>
                  {promptCopied ? '✓ Consigne copiée' : '📋 Copier la consigne'}
                </button>
                <a className="btn btn-small btn-ghost" href={CLAUDE_URL} target="_blank" rel="noreferrer">
                  Ouvrir claude.ai ↗
                </a>
              </span>
            </li>
            <li>
              Sur claude.ai, dans une nouvelle conversation : joins ton cours (📎 PDF, Word…), colle la consigne
              (Ctrl+V) et envoie.
            </li>
            <li>
              Quand Claude a fini, copie <strong>toute</strong> sa réponse (bouton « Copier » sous le message) et
              colle-la ici :
              <textarea
                value={claudeAnswer}
                onChange={(e) => setClaudeAnswer(e.target.value)}
                rows={6}
                placeholder='{ "summary": "…", "questions": [ … ] }'
                aria-label="Réponse de Claude"
                required
              />
            </li>
          </ol>
        )}

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button className="btn btn-primary" disabled={progress !== null}>
            {progress ?? (source === 'claude' ? '📥 Importer la réponse de Claude' : '✨ Analyser avec l’IA')}
          </button>
          {source !== 'claude' && (
            <span className="muted small">
              Environ 25 pages maximum. Ton fichier reste sur ton appareil : seul son texte est envoyé.
            </span>
          )}
        </div>
      </form>

      <section className="card">
        <h2>
          Mes documents <span className="count">{documents.length}</span>
        </h2>
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : documents.length === 0 ? (
          <p className="empty">Aucun document pour l’instant.</p>
        ) : (
          <ul className="list">
            {documents.map((doc) => (
              <li key={doc.id} className="list-item">
                <Link to={`/documents/${doc.id}`} className="grow stack-tight doc-link">
                  <strong>{doc.title}</strong>
                  <span className="row small">
                    <SubjectTag subject={subjectById.get(doc.subject_id)} />
                    <StatusBadge status={doc.status} />
                    <span className="muted">{formatDay(toISODate(new Date(doc.created_at)))}</span>
                  </span>
                </Link>
                <button className="btn btn-ghost btn-small" onClick={() => deleteDocument(doc)}>
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
