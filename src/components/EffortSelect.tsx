import { EFFORT_OPTIONS } from '../lib/assistant'
import type { ReasoningEffort } from '../lib/types'

interface Props {
  value: ReasoningEffort
  onChange: (effort: ReasoningEffort) => void
}

/** Liste « Rapide / Équilibrée / Approfondie » pour le temps de réflexion de l'IA. */
export default function EffortSelect({ value, onChange }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ReasoningEffort)}>
      {EFFORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
