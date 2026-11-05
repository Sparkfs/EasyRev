import { useEffect, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import EffortSelect from '../components/EffortSelect'
import SubjectSelect from '../components/SubjectSelect'
import StatusBadge from '../components/StatusBadge'
import SubjectTag from '../components/SubjectTag'
import { DEFAULT_EFFORT, startAnalysis } from '../lib/assistant'
import { buildClaudePrompt, CLAUDE_URL, parseClaudeAnswer } from '../lib/claudeImport'
import { formatDay, toISODate } from '../lib/dates'
import {
  ACCEPTED_FILES,
  APPROX_MAX_PAGES,
  cleanText,
  countPdfPages,
  extractText,
  isPdf,
  MAX_CHARACTERS,
  MIN_CHARACTERS,
  type PageRange,
} from '../lib/extractText'
import { supabase } from '../lib/supabase'
import type { ReasoningEffort, StudyDocument } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

type DocumentSummary = Pick<StudyDocument, 'id' | 'title' | 'file_name' | 'subject_id' | 'status' | 'created_at'>

const QUESTION_COUNTS = [8, 12, 16, 20, 25, 30]

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
  // Pour un PDF : son nombre de pages et la plage choisie (gardée en texte pour laisser taper librement).
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [fromPage, setFromPage] = useState('1')
  const [toPage, setToPage] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [claudeAnswer, setClaudeAnswer] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [questionCount, setQuestionCount] = useState(12)
  const [effort, setEffort] = useState<ReasoningEffort>(DEFAULT_EFFORT)
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

  async function chooseFile(next: File | null) {
    setFile(next)
    setPageCount(null)
    if (!next || !isPdf(next)) return
    try {
      const count = await countPdfPages(next)
      setPageCount(count)
      setFromPage('1')
      setToPage(String(count))
    } catch {
      // PDF illisible : l'erreur s'affichera au moment de l'analyse.
    }
  }

  /** Plage de pages choisie pour un PDF, vérifiée ; `undefined` pour les autres fichiers. */
  function selectedRange(): PageRange | undefined {
    if (source !== 'file' || pageCount === null) return undefined
    const from = Number.parseInt(fromPage, 10)
    const to = Number.parseInt(toPage, 10)
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > pageCount || from > to) {
      throw new Error(`Plage de pages invalide : choisis des pages entre 1 et ${pageCount}, la première avant la dernière.`)
    }
    return { from, to }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    try {
      if (source === 'claude') {
        await importFromClaude()
        return
      }
      const range = selectedRange()
      const partial = range !== undefined && pageCount !== null && (range.from > 1 || range.to < pageCount)
      const pagesLabel = partial ? ` (p. ${range.from}–${range.to})` : ''

      setProgress('Lecture du document…')
      const text = source === 'file' ? (file ? await extractText(file, range) : '') : cleanText(pastedText)
      if (text.length < MIN_CHARACTERS) {
        throw new Error(
          source === 'file'
            ? 'Ce document ne contient presque pas de texte. S’il s’agit d’un PDF scanné (une image), ' +
              'copie plutôt le texte dans l’onglet « Coller du texte », ou utilise l’onglet Claude.'
            : `Colle un texte plus long (au moins ${MIN_CHARACTERS} caractères).`,
        )
      }
      if (text.length > MAX_CHARACTERS) {
        throw new Error(
          `Ce document est trop long pour une seule analyse (${text.length.toLocaleString('fr-FR')} caractères ; ` +
            `maximum ${MAX_CHARACTERS.toLocaleString('fr-FR')}, soit environ ${APPROX_MAX_PAGES} pages). ` +
            (pageCount !== null
              ? 'Choisis une plage de pages plus courte, par exemple un chapitre.'
              : 'Envoie-le en plusieurs parties.'),
        )
      }

      setProgress('Envoi à l’assistant IA…')
      const { data, error } = await supabase
        .from('documents')
        .insert({
          subject_id: formSubjectId,
          title:
            title.trim() ||
            (file ? file.name.replace(/\.[^.]+$/, '') + pagesLabel : '') ||
            `Texte du ${formatDay(toISODate(new Date()))}`,
          file_name: source === 'file' && file ? file.name + pagesLabel : null,
          content: text,
          question_count: questionCount,
          reasoning_effort: effort,
        })
        .select('id')
        .single()
      if (error) {
        throw new Error(
          error.message.includes('reasoning_effort')
            ? 'La base n’est pas à jour : dans Supabase (SQL Editor), exécute le fichier supabase/mise-a-jour-1-reflexion.sql.'
            : error.message,
        )
      }

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
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
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

        {source === 'file' && pageCount !== null && (
          <div className="page-range">
            <label className="field">
              <span>De la page</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={pageCount}
                value={fromPage}
                onChange={(e) => setFromPage(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>À la page</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={pageCount}
                value={toPage}
                onChange={(e) => setToPage(e.target.value)}
                required
              />
            </label>
            <p className="muted small">
              Ce PDF fait <strong>{pageCount} pages</strong>.{' '}
              {pageCount > APPROX_MAX_PAGES && `Au-delà d’environ ${APPROX_MAX_PAGES} pages, choisis une partie. `}
              Pour un gros polycopié, analyse plutôt chapitre par chapitre : explications et questions seront plus
              précises.
            </p>
          </div>
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
          {source !== 'claude' && (
            <label className="field">
              <span>Réflexion de l’IA</span>
              <EffortSelect value={effort} onChange={setEffort} />
            </label>
          )}
        </div>

        {source !== 'claude' && (
          <p className="muted small">
            {effort === 'low' && 'Rapide : idéal pour des définitions ou du vocabulaire.'}
            {effort === 'medium' && 'Équilibrée : le bon choix pour la plupart des cours.'}
            {effort === 'high' &&
              'Approfondie : corrigés plus rigoureux pour les calculs et démonstrations. Les questions sont préparées ' +
                'par séries, ce qui peut prendre plusieurs minutes.'}
          </p>
        )}

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
              Jusqu’à environ {APPROX_MAX_PAGES} pages par analyse. Ton fichier reste sur ton appareil : seul son texte
              est envoyé.
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
