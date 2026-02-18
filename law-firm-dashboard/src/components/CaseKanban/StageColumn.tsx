import type { CaseStage, Case } from '../../types'
import { CaseCard } from './CaseCard'

interface Props {
  stage: CaseStage
  cases: Case[]
  selectedCaseId: string | null
}

export function StageColumn({ stage, cases, selectedCaseId }: Props) {
  return (
    <div className="kanban-col flex-shrink-0">
      {/* Column header */}
      <div className="kanban-col-header">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${stage.color}`} />
          <span className={`text-sm font-semibold truncate ${stage.textColor}`}>
            {stage.label}
          </span>
        </div>
        <span className="text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {cases.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1">
        {cases.length === 0 ? (
          <div className="text-center text-gray-700 text-xs py-6">No cases</div>
        ) : (
          cases.map((c) => (
            <CaseCard key={c.id} c={c} selected={selectedCaseId === c.id} />
          ))
        )}
      </div>
    </div>
  )
}
