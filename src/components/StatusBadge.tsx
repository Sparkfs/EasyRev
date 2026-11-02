import type { DocumentStatus } from '../lib/types'

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  if (status === 'ready') return <span className="status status-ready">✓ Prêt</span>
  if (status === 'error') return <span className="status status-error">⚠ Erreur</span>
  return <span className="status status-pending">⏳ Analyse en cours</span>
}
