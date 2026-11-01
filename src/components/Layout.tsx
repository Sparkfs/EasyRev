import { Link, NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'
import { formatClock, phaseLabel, usePomodoro } from '../pomodoro/usePomodoro'

const LINKS = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/matieres', label: 'Matières' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/planning', label: 'Planning' },
  { to: '/pomodoro', label: 'Pomodoro' },
]

export default function Layout({ email }: { email: string | undefined }) {
  const pomodoro = usePomodoro()

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand">
            Mes révisions
          </Link>
          <nav className="nav" aria-label="Navigation principale">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-end">
            {pomodoro.running && (
              <Link to="/pomodoro" className="timer-pill" title={phaseLabel(pomodoro.phase)}>
                {pomodoro.phase === 'work' ? '⏱' : '☕'} {formatClock(pomodoro.remainingMs)}
              </Link>
            )}
            <button className="btn btn-ghost btn-small" onClick={() => supabase.auth.signOut()} title={email}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
