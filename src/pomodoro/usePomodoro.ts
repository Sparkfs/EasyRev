import { createContext, useContext } from 'react'

export type Phase = 'work' | 'break'

export interface PomodoroState {
  phase: Phase
  running: boolean
  remainingMs: number
  workMinutes: number
  breakMinutes: number
  subjectId: string
  /** Nombre de séances de concentration terminées depuis l'ouverture du site. */
  sessionsDone: number
  saveError: string | null
  start: () => void
  pause: () => void
  reset: () => void
  skip: () => void
  setSubjectId: (subjectId: string) => void
  setDurations: (workMinutes: number, breakMinutes: number) => void
}

export const MINUTE = 60_000

export const PomodoroContext = createContext<PomodoroState | null>(null)

export function usePomodoro(): PomodoroState {
  const pomodoro = useContext(PomodoroContext)
  if (!pomodoro) throw new Error('usePomodoro doit être utilisé à l’intérieur de <PomodoroProvider>')
  return pomodoro
}

/** Ex. : « 24:59 » */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function phaseLabel(phase: Phase): string {
  return phase === 'work' ? 'Concentration' : 'Pause'
}
