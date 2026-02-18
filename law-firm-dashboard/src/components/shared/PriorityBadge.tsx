import type { TaskPriority } from '../../types'

interface Props {
  priority: TaskPriority
}

const CONFIG: Record<TaskPriority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-gray-700 text-gray-400' },
  medium: { label: 'Med',   cls: 'bg-blue-900/60 text-blue-300' },
  high:   { label: 'High',  cls: 'bg-amber-900/60 text-amber-300' },
  urgent: { label: 'Urgent', cls: 'bg-red-900/60 text-red-300' },
}

export function PriorityBadge({ priority }: Props) {
  const { label, cls } = CONFIG[priority]
  return (
    <span className={`badge ${cls}`}>{label}</span>
  )
}
