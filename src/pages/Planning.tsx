import { useEffect, useState, type SubmitEvent } from 'react'
import SubjectSelect from '../components/SubjectSelect'
import SubjectTag from '../components/SubjectTag'
import { byDueDate, formatDay, today } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Subject, Task } from '../lib/types'
import { useSubjects } from '../lib/useSubjects'

export default function Planning() {
  const { subjects } = useSubjects()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [dueDate, setDueDate] = useState(today())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    supabase
      .from('tasks')
      .select('*')
      .then(({ data, error }) => {
        if (ignore) return
        if (error) setError(error.message)
        else setTasks(data)
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  async function addTask(event: SubmitEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: trimmed, subject_id: subjectId || null, due_date: dueDate || null })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setTasks([...tasks, data])
    setTitle('')
    setError(null)
  }

  async function toggleTask(task: Task) {
    const { error } = await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id)
    if (error) {
      setError(error.message)
      return
    }
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
  }

  async function deleteTask(task: Task) {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) {
      setError(error.message)
      return
    }
    setTasks(tasks.filter((t) => t.id !== task.id))
  }

  const day = today()
  const sorted = [...tasks].sort(byDueDate)
  const open = sorted.filter((t) => !t.done)
  const groups = [
    { title: 'En retard', late: true, tasks: open.filter((t) => t.due_date !== null && t.due_date < day) },
    { title: 'Aujourd’hui', late: false, tasks: open.filter((t) => t.due_date === day) },
    { title: 'À venir', late: false, tasks: open.filter((t) => t.due_date !== null && t.due_date > day) },
    { title: 'Sans date', late: false, tasks: open.filter((t) => t.due_date === null) },
  ]
  const done = sorted.filter((t) => t.done)
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  const renderTask = (task: Task) => (
    <TaskItem
      key={task.id}
      task={task}
      subject={task.subject_id ? subjectById.get(task.subject_id) : undefined}
      onToggle={() => toggleTask(task)}
      onDelete={() => deleteTask(task)}
    />
  )

  return (
    <>
      <header className="page-header">
        <h1>Planning</h1>
        <p className="subtitle">Note ce que tu dois réviser et pour quand.</p>
      </header>

      <form className="card task-form" onSubmit={addTask}>
        <label className="field task-form-title">
          <span>À faire</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. : Relire le chapitre 3"
            maxLength={200}
            required
          />
        </label>
        <label className="field">
          <span>Matière</span>
          <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} emptyLabel="Aucune" />
        </label>
        <label className="field">
          <span>Pour le</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <button className="btn btn-primary">Ajouter</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : open.length === 0 ? (
        <section className="card empty">Aucune tâche en cours. Ajoute ce que tu dois réviser ci-dessus.</section>
      ) : (
        groups
          .filter((group) => group.tasks.length > 0)
          .map((group) => (
            <section key={group.title} className="card">
              <h2 className={group.late ? 'danger-text' : undefined}>
                {group.late && '⚠ '}
                {group.title} <span className="count">{group.tasks.length}</span>
              </h2>
              <ul className="list">{group.tasks.map(renderTask)}</ul>
            </section>
          ))
      )}

      {done.length > 0 && (
        <details className="card">
          <summary>
            Terminées <span className="count">{done.length}</span>
          </summary>
          <ul className="list">{done.map(renderTask)}</ul>
        </details>
      )}
    </>
  )
}

interface TaskItemProps {
  task: Task
  subject: Subject | undefined
  onToggle: () => void
  onDelete: () => void
}

function TaskItem({ task, subject, onToggle, onDelete }: TaskItemProps) {
  return (
    <li className="list-item">
      <label className="task-check grow">
        <input type="checkbox" checked={task.done} onChange={onToggle} />
        <span className="stack-tight">
          <span className={task.done ? 'done-text' : undefined}>{task.title}</span>
          {(subject || task.due_date) && (
            <span className="row small">
              <SubjectTag subject={subject} />
              {task.due_date && <span className="muted">{formatDay(task.due_date)}</span>}
            </span>
          )}
        </span>
      </label>
      <button className="btn btn-ghost btn-small" onClick={onDelete} aria-label={`Supprimer « ${task.title} »`}>
        Supprimer
      </button>
    </li>
  )
}
