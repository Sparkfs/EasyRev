// Ces types reflètent les tables de supabase/schema.sql.

export interface Subject {
  id: string
  name: string
  color: string
  created_at: string
}

export interface Flashcard {
  id: string
  subject_id: string
  front: string
  back: string
  repetitions: number
  interval_days: number
  ease: number
  /** Date de la prochaine révision, au format AAAA-MM-JJ. */
  due_date: string
  created_at: string
}

export interface Task {
  id: string
  subject_id: string | null
  title: string
  due_date: string | null
  done: boolean
  created_at: string
}

export interface StudySession {
  id: string
  subject_id: string | null
  minutes: number
  completed_at: string
}

// Tables de l'assistant IA (supabase/documents.sql)

export type DocumentStatus = 'pending' | 'ready' | 'error'

/** Temps de réflexion de l'IA : plus il est élevé, plus les corrigés sont rigoureux… et lents. */
export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface StudyDocument {
  id: string
  subject_id: string
  title: string
  file_name: string | null
  content: string
  question_count: number
  /** Réflexion choisie pour ce document ; null = réglage par défaut de l'Edge Function. */
  reasoning_effort: ReasoningEffort | null
  /** 'pending' pendant que l'IA travaille, 'ready' quand c'est fini, 'error' en cas de problème. */
  status: DocumentStatus
  error: string | null
  summary: string | null
  key_points: string[] | null
  sections: { title: string; content: string }[] | null
  glossary: { term: string; definition: string }[] | null
  updated_at: string
  created_at: string
}

export type QuestionKind = 'qcm' | 'vrai_faux' | 'courte' | 'trous' | 'ouverte'

export interface Question {
  id: string
  document_id: string
  position: number
  kind: QuestionKind
  difficulty: 'facile' | 'moyen' | 'difficile'
  prompt: string
  /** Propositions d'un QCM (null pour les autres types). */
  choices: string[] | null
  /** Indice de la bonne proposition d'un QCM (null pour les autres types). */
  correct_choice: number | null
  answer: string
  explanation: string
  added_to_flashcards: boolean
}
