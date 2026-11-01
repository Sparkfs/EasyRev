import type { Subject } from '../lib/types'

interface Props {
  subjects: Subject[]
  value: string
  onChange: (subjectId: string) => void
  /** Libellé de l'option « vide » ; sans lui, une matière doit être choisie. */
  emptyLabel?: string
  disabled?: boolean
}

export default function SubjectSelect({ subjects, value, onChange, emptyLabel, disabled }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={!emptyLabel} disabled={disabled}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {subjects.map((subject) => (
        <option key={subject.id} value={subject.id}>
          {subject.name}
        </option>
      ))}
    </select>
  )
}
