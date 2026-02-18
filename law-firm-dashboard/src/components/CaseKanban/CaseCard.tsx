import { Clock, CheckSquare, AlertCircle, Eye, ChevronRight, History } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Case } from '../../types'
import { useStore } from '../../store/useStore'
import { STAGE_MAP } from '../../data/stages'
import { HealthDot } from '../shared/HealthDot'

interface Props {
  c: Case
  selected: boolean
}

function Stat({ icon: Icon, value, label, warn }: {
  icon: React.ElementType
  value: number
  label: string
  warn?: boolean
}) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${warn && value > 0 ? 'text-red-400' : 'text-gray-400'}`}>
      <div className="flex items-center gap-1">
        <Icon size={11} />
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] leading-tight">{label}</span>
    </div>
  )
}

export function CaseCard({ c, selected }: Props) {
  const { selectCase, getMetrics, openAuditDrawer, openSkipModal, moveCase } = useStore()
  const m = getMetrics(c.id)
  const stage = STAGE_MAP.get(c.stage)

  const currentStep = stage?.steps.find((s) => s.id === c.stepId)
  const currentSubStep = currentStep?.subSteps.find((ss) => ss.id === c.subStepId)

  // Build stage progression options for "advance" button
  const allStages = Array.from(STAGE_MAP.values())
  const currentIdx = allStages.findIndex((s) => s.id === c.stage)
  const nextStage = currentIdx < allStages.length - 1 ? allStages[currentIdx + 1] : null

  const healthBorder: Record<string, string> = {
    green: selected ? 'border-emerald-500/60' : 'border-white/5',
    yellow: 'border-amber-500/40',
    red: 'border-red-500/50',
  }

  return (
    <div
      className={`card-base group relative ${selected ? 'ring-1 ring-blue-500/50 bg-surface-4' : ''} ${healthBorder[m.health]}`}
      onClick={() => selectCase(c.id)}
    >
      {/* Top row: case number + health */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <HealthDot health={m.health} />
          <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{c.caseNumber}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); openAuditDrawer(c.id) }}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-400 transition-opacity flex-shrink-0"
          title="View audit log"
        >
          <History size={12} />
        </button>
      </div>

      {/* Case title */}
      <p className="text-sm font-semibold text-gray-100 leading-tight mb-0.5 line-clamp-2">
        {c.title}
      </p>
      <p className="text-[11px] text-gray-500 mb-2 truncate">{c.client}</p>

      {/* Step / substep breadcrumb */}
      <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-2.5 min-w-0">
        <span className="truncate">{currentStep?.label ?? c.stepId}</span>
        {currentSubStep && (
          <>
            <ChevronRight size={10} className="flex-shrink-0 text-gray-600" />
            <span className="truncate text-gray-400">{currentSubStep.label}</span>
          </>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <div className="flex items-center gap-3">
          <Stat icon={Clock} value={m.daysInStage} label="days" warn={m.daysInStage >= (stage?.stuckThresholdDays ?? 999)} />
          <Stat icon={CheckSquare} value={m.openTasks} label="open" />
          <Stat icon={AlertCircle} value={m.overdueTasks} label="overdue" warn />
          <Stat icon={Eye} value={m.reviewTasks} label="review" />
        </div>

        {/* Advance button */}
        {nextStage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const allStageIds = allStages.map((s) => s.id)
              const skip = Math.abs(allStageIds.indexOf(nextStage.id) - allStageIds.indexOf(c.stage)) > 1
              if (skip) {
                openSkipModal(c.id, nextStage.id)
              } else {
                moveCase(c.id, nextStage.id)
              }
            }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded transition-all flex-shrink-0"
            title={`Advance to ${nextStage.label}`}
          >
            → {nextStage.label}
          </button>
        )}
      </div>

      {/* Owner + last activity */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
        <span className="text-[10px] text-gray-600 truncate">{c.owner}</span>
        <span className="text-[10px] text-gray-600 flex-shrink-0">
          {formatDistanceToNow(new Date(c.lastActivity), { addSuffix: true })}
        </span>
      </div>
    </div>
  )
}
