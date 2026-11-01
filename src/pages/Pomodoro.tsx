import SubjectSelect from '../components/SubjectSelect'
import { useSubjects } from '../lib/useSubjects'
import { formatClock, MINUTE, phaseLabel, usePomodoro } from '../pomodoro/usePomodoro'

const WORK_CHOICES = [15, 20, 25, 30, 45, 50, 60]
const BREAK_CHOICES = [3, 5, 10, 15, 20]

export default function Pomodoro() {
  const pomodoro = usePomodoro()
  const { subjects } = useSubjects()
  const total = (pomodoro.phase === 'work' ? pomodoro.workMinutes : pomodoro.breakMinutes) * MINUTE
  const started = pomodoro.running || pomodoro.remainingMs < total
  const progress = Math.min(1, 1 - pomodoro.remainingMs / total)

  return (
    <>
      <header className="page-header">
        <h1>Pomodoro</h1>
        <p className="subtitle">
          Concentre-toi sans interruption, puis fais une vraie pause. Chaque séance terminée est ajoutée à ton
          temps d’étude.
        </p>
      </header>

      <section className={`card timer-card phase-${pomodoro.phase}`}>
        <p className="timer-phase">{phaseLabel(pomodoro.phase)}</p>
        <p className="timer" role="timer">
          {formatClock(pomodoro.remainingMs)}
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Avancement de la phase"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="row center">
          {pomodoro.running ? (
            <button className="btn btn-large" onClick={pomodoro.pause}>
              Pause
            </button>
          ) : (
            <button className="btn btn-primary btn-large" onClick={pomodoro.start}>
              {started ? 'Reprendre' : 'Démarrer'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={pomodoro.reset} disabled={!started}>
            Recommencer
          </button>
          <button className="btn btn-ghost" onClick={pomodoro.skip}>
            {pomodoro.phase === 'work' ? 'Passer à la pause' : 'Terminer la pause'}
          </button>
        </div>
        <p className="muted small">
          Séances terminées : {pomodoro.sessionsDone}. Tu peux changer de page, le minuteur continue.
        </p>
      </section>

      {pomodoro.saveError && (
        <p className="error">La séance n’a pas pu être enregistrée : {pomodoro.saveError}</p>
      )}

      <section className="card stack">
        <h2>Réglages</h2>
        <div className="settings-grid">
          <label className="field">
            <span>Matière étudiée</span>
            <SubjectSelect
              subjects={subjects}
              value={pomodoro.subjectId}
              onChange={pomodoro.setSubjectId}
              emptyLabel="Aucune matière"
            />
          </label>
          <label className="field">
            <span>Concentration</span>
            <select
              value={pomodoro.workMinutes}
              disabled={pomodoro.running}
              onChange={(e) => pomodoro.setDurations(Number(e.target.value), pomodoro.breakMinutes)}
            >
              {WORK_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pause</span>
            <select
              value={pomodoro.breakMinutes}
              disabled={pomodoro.running}
              onChange={(e) => pomodoro.setDurations(pomodoro.workMinutes, Number(e.target.value))}
            >
              {BREAK_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>
        {pomodoro.running && <p className="muted small">Mets le minuteur en pause pour changer les durées.</p>}
      </section>
    </>
  )
}
