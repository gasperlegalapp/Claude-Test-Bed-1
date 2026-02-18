import type { Task, TaskStatus } from '../../types'
import { TaskCard } from './TaskCard'
import { useStore } from '../../store/useStore'

interface ColumnDef {
  id: TaskStatus
  label: string
  color: string
  textColor: string
}

export const TASK_COLUMNS: ColumnDef[] = [
  { id: 'backlog',     label: 'Backlog',     color: 'bg-gray-500',    textColor: 'text-gray-400' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-500',    textColor: 'text-blue-400' },
  { id: 'waiting',    label: 'Waiting',     color: 'bg-amber-500',   textColor: 'text-amber-400' },
  { id: 'review',     label: 'Review',      color: 'bg-violet-500',  textColor: 'text-violet-400' },
  { id: 'blocked',    label: 'Blocked',     color: 'bg-red-500',     textColor: 'text-red-400' },
  { id: 'done',       label: 'Done',        color: 'bg-emerald-500', textColor: 'text-emerald-400' },
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
      <div className="kanban-col-header">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${col.color}`} />
          <span className={`text-sm font-semibold truncate ${col.textColor}`}>{col.label}</span>
        </div>
        <span className="text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1">
        {tasks.length === 0 ? (
          <div className="text-center text-gray-700 text-xs py-6 border border-dashed border-white/5 rounded-lg">
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
