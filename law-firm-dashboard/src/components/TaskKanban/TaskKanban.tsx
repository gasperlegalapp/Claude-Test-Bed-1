import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { TaskColumn, TASK_COLUMNS } from './TaskColumn'

export function TaskKanban() {
  const { selectedCaseId, selectCase, getTasksForCase, cases } = useStore()
  const tasks = getTasksForCase(selectedCaseId)
  const selectedCase = cases.find((c) => c.id === selectedCaseId)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Task Board</h2>
            <p className="text-[11px] text-gray-500">
              {selectedCase
                ? `Filtered: ${selectedCase.caseNumber} — ${selectedCase.title}`
                : 'All tasks across all cases'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          {selectedCase && (
            <button
              onClick={() => selectCase(null)}
              className="btn-ghost text-xs gap-1"
              title="Clear case filter"
            >
              <X size={13} />
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Task Kanban columns */}
      <div className="flex gap-3 overflow-x-auto px-4 py-3 flex-1 min-h-0">
        {TASK_COLUMNS.map((col) => (
          <TaskColumn
            key={col.id}
            col={col}
            tasks={tasks.filter((t) => t.status === col.id)}
          />
        ))}
      </div>
    </div>
  )
}
