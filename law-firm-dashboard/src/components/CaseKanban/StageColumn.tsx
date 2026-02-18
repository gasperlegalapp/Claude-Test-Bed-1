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
      {/* Colored top accent bar */}
      <div className={`h-0.5 w-full ${stage.color}`} />

      {/* Column header with subtle stage-colored background */}
      <div className={`kanban-col-header ${stage.accentBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.color}`} style={{ boxShadow: `0 0 6px currentColor` }} />
          <span className={`text-xs font-bold uppercase tracking-wider truncate ${stage.textColor}`}>
            {stage.label}
          </span>
        </div>
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${stage.textColor}`}
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {cases.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1">
        {cases.length === 0 ? (
          <div
            className="text-center text-xs py-6 rounded-lg"
            style={{
              color: 'rgba(255,255,255,0.15)',
              border: '1px dashed rgba(255,255,255,0.07)',
            }}
          >
            No cases
          </div>
        ) : (
          cases.map((c) => (
            <CaseCard key={c.id} c={c} selected={selectedCaseId === c.id} />
          ))
        )}
      </div>
    </div>
  )
}
