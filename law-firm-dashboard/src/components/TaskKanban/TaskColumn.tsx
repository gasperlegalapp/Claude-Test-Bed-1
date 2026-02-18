import type { Task, TaskStatus } from '../../types'
import { TaskCard } from './TaskCard'
import { useStore } from '../../store/useStore'

interface ColumnDef {
  id: TaskStatus
  label: string
  color: string
  textColor: string
  accentBg: string
}

export const TASK_COLUMNS: ColumnDef[] = [
  { id: 'backlog',     label: 'Backlog',     color: 'bg-gray-500',    textColor: 'text-gray-400',    accentBg: 'bg-gray-500/10' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-500',    textColor: 'text-blue-400',    accentBg: 'bg-blue-500/10' },
  { id: 'waiting',    label: 'Waiting',     color: 'bg-amber-500',   textColor: 'text-amber-400',   accentBg: 'bg-amber-500/10' },
  { id: 'review',     label: 'Review',      color: 'bg-violet-500',  textColor: 'text-violet-400',  accentBg: 'bg-violet-500/10' },
  { id: 'blocked',    label: 'Blocked',     color: 'bg-red-500',     textColor: 'text-red-400',     accentBg: 'bg-red-500/10' },
  { id: 'done',       label: 'Done',        color: 'bg-emerald-500', textColor: 'text-emerald-400', accentBg: 'bg-emerald-500/10' },
]

interface Props {
  col: ColumnDef
  tasks: Task[]
}

export function TaskColumn({ col, tasks }: Props) {
  const { moveTask } = useStore()

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) moveTask(taskId, col.id)
  }

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="kanban-col flex-shrink-0"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Colored top accent bar */}
      <div className={`h-0.5 w-full ${col.color}`} />

      {/* Column header */}
      <div className={`kanban-col-header ${col.accentBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.color}`} />
          <span className={`text-xs font-bold uppercase tracking-wider truncate ${col.textColor}`}>
            {col.label}
          </span>
        </div>
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${col.textColor}`}
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1">
        {tasks.length === 0 ? (
          <div
            className="text-center text-xs py-6 rounded-lg"
            style={{
              color: 'rgba(255,255,255,0.15)',
              border: '1px dashed rgba(255,255,255,0.07)',
            }}
          >
            Drop here
          </div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t.id)}
              className="cursor-grab active:cursor-grabbing"
            >
              <TaskCard task={t} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
