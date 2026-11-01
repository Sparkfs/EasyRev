import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import { useSession } from './lib/useSession'
import Dashboard from './pages/Dashboard'
import Flashcards from './pages/Flashcards'
import Login from './pages/Login'
import Planning from './pages/Planning'
import Pomodoro from './pages/Pomodoro'
import Review from './pages/Review'
import SetupMissing from './pages/SetupMissing'
import Subjects from './pages/Subjects'
import PomodoroProvider from './pomodoro/PomodoroProvider'

export default function App() {
  if (!isSupabaseConfigured) return <SetupMissing />
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const session = useSession()

  if (session === undefined) return <p className="centered muted">Chargement…</p>
  if (session === null) return <Login />

  return (
    <BrowserRouter>
      <PomodoroProvider>
        <Routes>
          <Route element={<Layout email={session.user.email} />}>
            <Route index element={<Dashboard />} />
            <Route path="matieres" element={<Subjects />} />
            <Route path="flashcards" element={<Flashcards />} />
            <Route path="reviser" element={<Review />} />
            <Route path="planning" element={<Planning />} />
            <Route path="pomodoro" element={<Pomodoro />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PomodoroProvider>
    </BrowserRouter>
  )
}
