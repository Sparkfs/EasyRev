export default function SetupMissing() {
  return (
    <main className="auth-page">
      <div className="card stack auth-card">
        <h1>Encore une étape : connecter Supabase</h1>
        <p>
          Le site a besoin d’une base de données Supabase pour enregistrer tes matières, tes flashcards et
          tes tâches.
        </p>
        <ol className="steps">
          <li>
            Crée un projet gratuit sur{' '}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
              supabase.com
            </a>
            .
          </li>
          <li>
            Dans <strong>SQL Editor</strong>, colle et exécute le fichier <code>supabase/schema.sql</code>.
          </li>
          <li>
            Copie <code>.env.example</code> sous le nom <code>.env.local</code> et remplis l’URL du projet et la
            clé « publishable ».
          </li>
          <li>
            Arrête puis relance <code>npm run dev</code>.
          </li>
        </ol>
        <p className="muted">Le détail de chaque étape est dans le fichier README.md.</p>
      </div>
    </main>
  )
}
