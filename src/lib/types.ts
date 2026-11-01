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
