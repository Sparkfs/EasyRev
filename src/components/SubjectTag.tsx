import type { Subject } from '../lib/types'

export default function SubjectTag({ subject }: { subject: Subject | undefined }) {
  if (!subject) return null
  return (
    <span className="chip">
      <span className="dot" style={{ background: subject.color }} />
      {subject.name}
    </span>
  )
}
