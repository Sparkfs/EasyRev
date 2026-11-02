import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import SubjectTag from '../components/SubjectTag'
import { byDueDate, formatDay, formatDuration, startOfWeek, today } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { StudySession, Task } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

type WeekSession = Pick<StudySession, 'subject_id' | 'minutes'>

export default function Dashboard() {
  const { subjects } = useSubjects()
  const [loading, setLoading] = useState(true)
  const [dueCards, setDueCards] = useState(0)
  const [openTasks, setOpenTasks] = useState<Task[]>([])
  const [weekSessions, setWeekSessions] = useState<WeekSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    Promise.all([
      supabase.from('flashcards').select('id', { count: 'exact', head: true }).lte('due_date', today()),
      supabase.from('tasks').select('*').eq('done', false),
      supabase.from('study_sessions').select('subject_id, minutes').gte('completed_at', startOfWeek().toISOString()),
    ]).then(([cards, tasks, sessions]) => {
      if (ignore) return
      const failure = cards.error ?? tasks.error ?? sessions.error
      if (failure) setError(failure.message)
      else {
        setDueCards(cards.count ?? 0)
        setOpenTasks(tasks.data ?? [])
        setWeekSessions(sessions.data ?? [])
      }
      setLoading(false)
    })
    return () => {
      ignore = true
    }
  }, [])

  const day = today()
  const lateTasks = openTasks.filter((t) => t.due_date !== null && t.due_date < day)
  const todayTasks = openTasks.filter((t) => t.due_date === day)
  const nextTasks = openTasks
    .filter((t) => t.due_date !== null)
    .sort(byDueDate)
    .slice(0, 5)
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  // Temps d'étude de la semaine, regroupé par matière, du plus grand au plus petit.
  const minutesBySubject = new Map<string, number>()
  for (const session of weekSessions) {
    const key = session.subject_id ?? ''
    minutesBySubject.set(key, (minutesBySubject.get(key) ?? 0) + session.minutes)
  }
  const studyRows = [...minutesBySubject]
    .map(([subjectId, minutes]) => ({
      key: subjectId,
      label: subjectById.get(subjectId)?.name ?? 'Sans matière',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes)
  const totalMinutes = studyRows.reduce((sum, row) => sum + row.minutes, 0)
  const maxMinutes = Math.max(1, ...studyRows.map((row) => row.minutes))

  const show = (value: string | number) => (loading ? '–' : value)

  return (
    <>
      <header className="page-header">
        <h1>Tableau de bord</h1>
        <p className="subtitle capitalize">{formatDay(day, 'long')}</p>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="kpi-row">
        <section className="card kpi kpi-yellow">
          <h2 className="kpi-label">Cartes à réviser aujourd’hui</h2>
          <p className="kpi-value">{show(dueCards)}</p>
          {!loading &&
            (dueCards > 0 ? (
              <Link className="btn btn-small" to="/reviser">
                Commencer la révision →
              </Link>
            ) : (
              <p className="kpi-note">Tout est à jour.</p>
            ))}
        </section>
        <section className="card kpi kpi-pink">
          <h2 className="kpi-label">Tâches pour aujourd’hui</h2>
          <p className="kpi-value">{show(todayTasks.length + lateTasks.length)}</p>
          {!loading && (
            <p className="kpi-note">
              {lateTasks.length > 0 ? `⚠ dont ${lateTasks.length} en retard !` : 'Aucune en retard'}
            </p>
          )}
        </section>
        <section className="card kpi kpi-blue">
          <h2 className="kpi-label">Temps d’étude cette semaine</h2>
          <p className="kpi-value">{show(formatDuration(totalMinutes))}</p>
          {!loading && (
            <p className="kpi-note">
              {weekSessions.length} {weekSessions.length > 1 ? 'séances' : 'séance'} Pomodoro
            </p>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Temps d’étude par matière</h2>
          <p className="muted small">Depuis lundi</p>
          {!loading && studyRows.length === 0 ? (
            <p className="empty">
              Lance un <Link to="/pomodoro">Pomodoro</Link> pour mesurer ton temps d’étude.
            </p>
          ) : (
            <ul className="bars">
              {studyRows.map((row) => (
                <li key={row.key} className="bar-row" title={`${row.label} : ${formatDuration(row.minutes)}`}>
                  <span className="bar-label">{row.label}</span>
                  <span className="bar-track">
                    <span className="bar" style={{ width: `${(row.minutes / maxMinutes) * 100}%` }} />
                  </span>
                  <span className="bar-value">{formatDuration(row.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Prochaines échéances</h2>
          {!loading && nextTasks.length === 0 ? (
            <p className="empty">
              Rien de prévu. Ajoute des tâches dans le <Link to="/planning">planning</Link>.
            </p>
          ) : (
            <ul className="list">
              {nextTasks.map((task) => {
                const late = task.due_date !== null && task.due_date < day
                return (
                  <li key={task.id} className="list-item">
                    <span className="grow stack-tight">
                      <span>{task.title}</span>
                      <SubjectTag subject={task.subject_id ? subjectById.get(task.subject_id) : undefined} />
                    </span>
                    <span className={`small ${late ? 'danger-text' : 'muted'}`}>
                      {late && '⚠ En retard · '}
                      {task.due_date === day ? 'Aujourd’hui' : formatDay(task.due_date!)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="small">
            <Link to="/planning">Voir tout le planning →</Link>
          </p>
        </section>
      </div>
    </>
  )
}
