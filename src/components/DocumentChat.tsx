import { useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import { askAboutDocument, MAX_QUESTION_LENGTH } from '../lib/assistant'
import { supabase } from '../lib/supabase'
import type { DocumentMessage } from '../lib/types'

const SUGGESTIONS = [
  'Quelle est la notion la plus difficile de ce document ? Explique-la-moi simplement.',
  'Donne-moi un exemple concret d’application de ce cours.',
  'Que dois-je absolument maîtriser pour un examen sur ce document ?',
]

interface Props {
  documentId: string
  /** Vrai quand l'onglet de la conversation est affiché. */
  active: boolean
  draft: string
  onDraftChange: (draft: string) => void
  /** Vrai pour un document analysé dans claude.ai : l'IA n'en connaît que l'explication, pas le texte. */
  explanationOnly: boolean
}

function byDate(a: DocumentMessage, b: DocumentMessage): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

// La conversation avec l'IA à propos d'un document : elle est enregistrée et retrouvée à la prochaine visite.
export default function DocumentChat({ documentId, active, draft, onDraftChange, explanationOnly }: Props) {
  const [messages, setMessages] = useState<DocumentMessage[]>([])
  // La question en cours d'envoi, affichée en attendant la réponse.
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let ignore = false
    supabase
      .from('document_messages')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at')
      .then(({ data, error }) => {
        if (ignore) return
        if (error) {
          setError(
            error.message.includes('document_messages')
              ? 'La base n’est pas à jour : dans Supabase (SQL Editor), exécute le fichier supabase/mise-a-jour-2-conversation.sql.'
              : error.message,
          )
        } else {
          setMessages(data)
        }
      })
    return () => {
      ignore = true
    }
  }, [documentId])

  // Garde le dernier message visible.
  useEffect(() => {
    if (active && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [active, messages, pending])

  // Quand une question est préparée (bouton « Je ne comprends pas »), on place le curseur dans le champ.
  useEffect(() => {
    if (active && draft) inputRef.current?.focus()
  }, [active, draft])

  async function send(event: SubmitEvent) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || pending !== null) return
    setPending(question)
    setError(null)
    onDraftChange('')
    try {
      const saved = await askAboutDocument(documentId, question)
      setMessages((current) => [...current, ...saved].sort(byDate))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      onDraftChange(question) // on rend la question pour ne pas la perdre
    } finally {
      setPending(null)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  async function clearConversation() {
    if (!confirm('Effacer toute la conversation sur ce document ?')) return
    const { error } = await supabase.from('document_messages').delete().eq('document_id', documentId)
    if (error) setError(error.message)
    else setMessages([])
  }

  const isEmpty = messages.length === 0 && pending === null

  return (
    <section className="card chat">
      <div className="toolbar">
        <h2 className="chat-title">Une partie t’échappe ? Demande à l’IA</h2>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-small" onClick={clearConversation}>
            Effacer la conversation
          </button>
        )}
      </div>

      {explanationOnly && (
        <p className="muted small">
          Ce document a été analysé dans claude.ai : l’IA connaît son explication, mais pas son texte complet.
        </p>
      )}

      {isEmpty ? (
        <div className="chat-empty">
          <p className="muted">Pose ta question, ou commence par l’une de celles-ci :</p>
          <div className="stack-tight">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="chat-suggestion" onClick={() => onDraftChange(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation avec l’IA">
          {messages.map((message) => (
            <article key={message.id} className={`chat-message chat-${message.role}`}>
              <p className="chat-author">{message.role === 'user' ? 'Toi' : 'IA'}</p>
              <p className="pre-wrap">{message.content}</p>
            </article>
          ))}
          {pending !== null && (
            <>
              <article className="chat-message chat-user">
                <p className="chat-author">Toi</p>
                <p className="pre-wrap">{pending}</p>
              </article>
              <p className="chat-thinking">
                <span className="spinner" aria-hidden="true" />
                L’IA réfléchit…
              </p>
            </>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <form className="chat-form" ref={formRef} onSubmit={send}>
        <label className="field">
          <span>Ta question</span>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="Ex. : Je ne comprends pas pourquoi la contrainte est maximale en surface."
            required
          />
        </label>
        <div className="row">
          <button className="btn btn-primary" disabled={pending !== null}>
            {pending !== null ? 'Envoi…' : 'Envoyer'}
          </button>
          <span className="muted small">Entrée pour envoyer, Maj+Entrée pour aller à la ligne.</span>
        </div>
      </form>
    </section>
  )
}
