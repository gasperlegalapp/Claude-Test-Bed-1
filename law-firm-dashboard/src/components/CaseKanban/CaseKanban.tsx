import { useStore } from '../../store/useStore'
import { STAGES } from '../../data/stages'
import { StageColumn } from './StageColumn'
import { FilterBar } from '../FilterBar'

export function CaseKanban() {
  const { getFilteredCases, selectedCaseId } = useStore()
  const filtered = getFilteredCases()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Case Workflow Board</h2>
          <p className="text-[11px] text-gray-500">All cases across lifecycle stages</p>
        </div>
        <span className="text-xs text-gray-500">
          {filtered.length} case{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <FilterBar />

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto px-4 py-3 flex-1 min-h-0">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            cases={filtered.filter((c) => c.stage === stage.id)}
            selectedCaseId={selectedCaseId}
          />
        ))}
      </div>
    </div>
  )
}
