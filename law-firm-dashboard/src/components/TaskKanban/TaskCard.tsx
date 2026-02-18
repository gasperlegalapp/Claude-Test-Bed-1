import { User, Calendar, StickyNote } from 'lucide-react'
import { format, isPast, parseISO } from 'date-fns'
import type { Task } from '../../types'
import { PriorityBadge } from '../shared/PriorityBadge'
import { useStore } from '../../store/useStore'

interface Props {
  task: Task
}

const priorityBorderClass: Record<string, string> = {
  low:    'card-priority-low',
  medium: 'card-priority-medium',
  high:   'card-priority-high',
  urgent: 'card-priority-urgent',
}

export function TaskCard({ task }: Props) {
  const { cases } = useStore()
  const parentCase = cases.find((c) => c.id === task.caseId)

  const isOverdue = task.status !== 'done' && task.dueDate && isPast(parseISO(task.dueDate))
  const dueDateStr = task.dueDate ? format(parseISO(task.dueDate), 'MMM d') : null

  return (
    <div className={`card-base text-left w-full ${priorityBorderClass[task.priority]}`}>
      {/* Case label */}
      {parentCase && (
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[10px] text-gray-600 font-mono truncate">
            {parentCase.caseNumber}
          </span>
        </div>
      )}

      {/* Task title */}
      <p className="text-xs font-medium text-gray-200 leading-tight mb-2 line-clamp-3">
        {task.title}
      </p>

      {/* Notes */}
      {task.notes && (
        <div className="flex items-start gap-1 mb-2">
          <StickyNote size={10} className="text-gray-700 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-gray-500 leading-tight line-clamp-2">{task.notes}</p>
        </div>
      )}

      {/* Footer row */}
      <div
        className="flex items-center justify-between gap-1 mt-2 pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <PriorityBadge priority={task.priority} />
        <div className="flex items-center gap-2 min-w-0">
          {task.assignee && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 min-w-0">
              <User size={10} className="flex-shrink-0" />
              <span className="truncate">{task.assignee.split(' ')[0]}</span>
            </div>
          )}
          {dueDateStr && (
            <div
              className={`flex items-center gap-1 text-[10px] flex-shrink-0 ${
                isOverdue ? 'text-red-400 font-semibold' : 'text-gray-500'
              }`}
            >
              <Calendar size={10} />
              <span>{dueDateStr}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
