import { useState } from 'react'
import { KIND_LABELS } from '../lib/assistant'
import type { Question } from '../lib/types'

interface Props {
  question: Question
  number: number
  /** Appelé une fois que l'élève a répondu : juste ou non. */
  onResult: (correct: boolean) => void
  onAddFlashcard: () => void
}

// Une question interactive : QCM et vrai/faux sont corrigés automatiquement ;
// pour les autres types, l'élève écrit sa réponse, découvre le corrigé et s'auto-évalue.
export default function QuestionCard({ question, number, onResult, onAddFlashcard }: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [selfGrade, setSelfGrade] = useState<boolean | null>(null)

  const options =
    question.kind === 'qcm' ? (question.choices ?? []) : question.kind === 'vrai_faux' ? ['Vrai', 'Faux'] : null
  const correctIndex =
    question.kind === 'qcm'
      ? (question.correct_choice ?? 0)
      : question.kind === 'vrai_faux'
        ? question.answer.trim().toLowerCase().startsWith('v')
          ? 0
          : 1
        : -1

  function pick(index: number) {
    if (revealed) return
    setPicked(index)
    setRevealed(true)
    onResult(index === correctIndex)
  }

  function grade(correct: boolean) {
    setSelfGrade(correct)
    onResult(correct)
  }

  return (
    <article className="card question-card">
      <header className="row small">
        <span className="question-number">{number}</span>
        <span className="chip">{KIND_LABELS[question.kind]}</span>
        <span className="muted">{question.difficulty}</span>
      </header>

      <p className="question-prompt pre-wrap">{question.prompt}</p>

      {options ? (
        <div className="choices">
          {options.map((option, i) => {
            const state = !revealed ? '' : i === correctIndex ? 'correct' : i === picked ? 'wrong' : 'dimmed'
            return (
              <button key={i} type="button" className={`choice ${state}`} onClick={() => pick(i)} disabled={revealed}>
                {question.kind === 'qcm' && <span className="choice-letter">{String.fromCharCode(65 + i)}</span>}
                <span className="grow">{option}</span>
                {state === 'correct' && <span aria-label="bonne réponse">✓</span>}
                {state === 'wrong' && <span aria-label="mauvaise réponse">✗</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="stack-tight">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={question.kind === 'ouverte' ? 4 : 2}
            placeholder="Ta réponse (facultatif, pour t’entraîner)…"
            disabled={revealed}
            aria-label="Ta réponse"
          />
          {!revealed && (
            <div>
              <button type="button" className="btn btn-primary btn-small" onClick={() => setRevealed(true)}>
                Voir la correction
              </button>
            </div>
          )}
        </div>
      )}

      {revealed && (
        <div className="solution">
          {options && (
            <p className={picked === correctIndex ? 'result-good' : 'result-bad'}>
              {picked === correctIndex ? '✓ Bonne réponse !' : '✗ Ce n’est pas ça.'}
            </p>
          )}
          <p className="pre-wrap">
            <strong>Réponse : </strong>
            {question.answer}
          </p>
          {question.explanation && (
            <p className="pre-wrap muted-strong">
              <strong>Explication : </strong>
              {question.explanation}
            </p>
          )}
          {!options &&
            (selfGrade === null ? (
              <div className="row">
                <span className="small muted">Tu avais juste ?</span>
                <button type="button" className="btn btn-small" onClick={() => grade(true)}>
                  ✓ Oui
                </button>
                <button type="button" className="btn btn-small" onClick={() => grade(false)}>
                  ✗ Pas encore
                </button>
              </div>
            ) : (
              <p className={selfGrade ? 'result-good' : 'result-bad'}>
                {selfGrade ? '✓ Bien joué !' : '✗ À revoir : ajoute-la à tes flashcards.'}
              </p>
            ))}
        </div>
      )}

      <footer>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onAddFlashcard}
          disabled={question.added_to_flashcards}
        >
          {question.added_to_flashcards ? '✓ Dans tes flashcards' : '+ Ajouter aux flashcards'}
        </button>
      </footer>
    </article>
  )
}
