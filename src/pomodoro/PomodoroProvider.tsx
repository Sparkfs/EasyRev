import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { formatClock, MINUTE, phaseLabel, PomodoroContext, type Phase } from './usePomodoro'

const APP_TITLE = 'Mes révisions'

// Le minuteur vit ici, au-dessus des pages, pour continuer à tourner quand on change de page.
export default function PomodoroProvider({ children }: { children: ReactNode }) {
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [phase, setPhase] = useState<Phase>('work')
  const [remainingMs, setRemainingMs] = useState(25 * MINUTE)
  // Heure de fin de la phase en cours ; `null` quand le minuteur est arrêté.
  // On compare à l'horloge plutôt que de décompter, pour rester juste même si l'onglet est en arrière-plan.
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [subjectId, setSubjectId] = useState('')
  const [sessionsDone, setSessionsDone] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  const durationOf = (p: Phase) => (p === 'work' ? workMinutes : breakMinutes) * MINUTE

  useEffect(() => {
    if (endsAt === null) return
    const timer = setInterval(() => {
      const left = endsAt - Date.now()
      if (left > 0) {
        setRemainingMs(left)
        return
      }
      clearInterval(timer)
      playBell()
      if (phase === 'work') {
        setSessionsDone((n) => n + 1)
        supabase
          .from('study_sessions')
          .insert({ minutes: workMinutes, subject_id: subjectId || null })
          .then(({ error }) => setSaveError(error ? error.message : null))
        // La pause démarre toute seule…
        setPhase('break')
        setRemainingMs(breakMinutes * MINUTE)
        setEndsAt(Date.now() + breakMinutes * MINUTE)
      } else {
        // … mais la séance suivante attend que tu cliques sur « Démarrer ».
        setPhase('work')
        setRemainingMs(workMinutes * MINUTE)
        setEndsAt(null)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [endsAt, phase, workMinutes, breakMinutes, subjectId])

  // Affiche le temps restant dans le titre de l'onglet.
  useEffect(() => {
    if (endsAt === null) return
    document.title = `${formatClock(remainingMs)} · ${phaseLabel(phase)}`
    return () => {
      document.title = APP_TITLE
    }
  }, [endsAt, remainingMs, phase])

  return (
    <PomodoroContext
      value={{
        phase,
        running: endsAt !== null,
        remainingMs,
        workMinutes,
        breakMinutes,
        subjectId,
        sessionsDone,
        saveError,
        start: () => {
          if (endsAt === null) setEndsAt(Date.now() + remainingMs)
        },
        pause: () => {
          if (endsAt === null) return
          setRemainingMs(Math.max(0, endsAt - Date.now()))
          setEndsAt(null)
        },
        reset: () => {
          setEndsAt(null)
          setRemainingMs(durationOf(phase))
        },
        skip: () => {
          const next = phase === 'work' ? 'break' : 'work'
          setEndsAt(null)
          setPhase(next)
          setRemainingMs(durationOf(next))
        },
        setSubjectId,
        setDurations: (work, pause) => {
          setWorkMinutes(work)
          setBreakMinutes(pause)
          if (endsAt === null) setRemainingMs((phase === 'work' ? work : pause) * MINUTE)
        },
      }}
    >
      {children}
    </PomodoroContext>
  )
}

/** Petit « ding » joué à la fin de chaque phase. */
function playBell() {
  try {
    const audio = new AudioContext()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.2, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.2)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 1.2)
    oscillator.onended = () => audio.close()
  } catch {
    // Son indisponible (navigateur ou réglages) : on ignore.
  }
}
