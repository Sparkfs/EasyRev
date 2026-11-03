import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { DocumentMessage, Question, QuestionKind, ReasoningEffort } from './types'

export const KIND_LABELS: Record<QuestionKind, string> = {
  qcm: 'QCM',
  vrai_faux: 'Vrai ou faux',
  courte: 'Réponse courte',
  trous: 'Texte à trous',
  ouverte: 'Question ouverte',
}

export const DEFAULT_EFFORT: ReasoningEffort = 'medium'

export const EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'low', label: 'Rapide' },
  { value: 'medium', label: 'Équilibrée' },
  { value: 'high', label: 'Approfondie' },
]

/** Au-delà de ce nombre de questions, une réflexion approfondie risque de dépasser le temps limite (150 s). */
export const MAX_QUESTIONS_FOR_HIGH_EFFORT = 16

export function effortLabel(effort: ReasoningEffort | null): string {
  return EFFORT_OPTIONS.find((o) => o.value === (effort ?? DEFAULT_EFFORT))!.label
}

/**
 * Demande à l'Edge Function « study-assistant » d'analyser un document.
 * Elle répond tout de suite et travaille en arrière-plan ; la page suit ensuite la colonne `status`.
 * Renvoie un message d'erreur, ou `null` si la demande a bien été prise en compte.
 */
export async function startAnalysis(documentId: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke('study-assistant', { body: { document_id: documentId } })
  if (!error) return null

  const message = await describeFunctionError(error)
  // On l'inscrit sur le document pour que la page l'affiche, même après un rechargement.
  await supabase.from('documents').update({ status: 'error', error: message }).eq('id', documentId)
  return message
}

/** Même limite que dans l'Edge Function. */
export const MAX_QUESTION_LENGTH = 2000

/**
 * Pose une question à l'IA sur un document. Renvoie la question et la réponse, enregistrées en base.
 * La clé `ask_document_id` est volontairement distincte de `document_id` : une ancienne version de
 * l'Edge Function refuse alors la demande au lieu de relancer l'analyse du document.
 */
export async function askAboutDocument(documentId: string, question: string): Promise<DocumentMessage[]> {
  const { data, error } = await supabase.functions.invoke('study-assistant', {
    body: { ask_document_id: documentId, question },
  })
  if (error) {
    const message = await describeFunctionError(error)
    throw new Error(
      message === 'document_id manquant.'
        ? 'L’assistant IA n’est pas à jour : redéploie la dernière version de la fonction « study-assistant » dans Supabase.'
        : message,
    )
  }
  return data.messages
}

function shorten(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`
}

/** Question préparée quand on ne comprend pas une partie de l'explication. */
export function sectionHelpQuestion(title: string): string {
  return `Je ne comprends pas la partie « ${shorten(title, 200)} ». Peux-tu me l’expliquer autrement, avec un exemple concret ?`
}

/** Question préparée quand on ne comprend pas le corrigé d'une question. */
export function correctionHelpQuestion(question: Question): string {
  return (
    `Je ne comprends pas le corrigé de cette question : « ${shorten(question.prompt, 700)} » ` +
    `(réponse : ${shorten(question.answer, 700)}). Peux-tu m’expliquer le raisonnement étape par étape ?`
  )
}

async function describeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsFetchError) {
    return 'Impossible de joindre l’assistant IA. Vérifie ta connexion internet.'
  }
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    let body: { error?: string; message?: string; msg?: string } = {}
    try {
      body = await response.json()
    } catch {
      // réponse sans JSON
    }
    if (body.error) return body.error
    if (response.status === 404) {
      return 'L’assistant IA n’est pas encore installé : déploie l’Edge Function « study-assistant » dans Supabase.'
    }
    if (response.status === 401) {
      return 'Supabase a refusé l’accès à l’assistant IA. Dans les réglages de la fonction « study-assistant », ' +
        'désactive « Verify JWT », puis réessaie.'
    }
    return `L’assistant IA a répondu ${response.status} : ${body.message ?? body.msg ?? 'erreur inconnue'}`
  }
  return error instanceof Error ? error.message : String(error)
}

/** Transforme une question en flashcard (recto / verso). */
export function questionToFlashcard(question: Question): { front: string; back: string } {
  if (question.kind === 'qcm' && question.choices) {
    const letter = (i: number) => String.fromCharCode(65 + i) // 0 → A, 1 → B…
    const choices = question.choices.map((choice, i) => `${letter(i)}. ${choice}`).join('\n')
    const correct = question.correct_choice ?? 0
    return {
      front: `${question.prompt}\n\n${choices}`,
      back: `${letter(correct)}. ${question.answer}\n\n${question.explanation}`,
    }
  }
  const front = question.kind === 'vrai_faux' ? `Vrai ou faux ? ${question.prompt}` : question.prompt
  return { front, back: `${question.answer}\n\n${question.explanation}`.trim() }
}
