import { differenceInDays, parseISO } from 'date-fns'
import type { Case, Task, CaseMetrics, HealthStatus } from '../types'
import { STAGE_MAP } from '../data/stages'

export function computeMetrics(c: Case, tasks: Task[]): CaseMetrics {
  const caseTasks = tasks.filter((t) => t.caseId === c.id)
  const now = new Date()

  const openTasks = caseTasks.filter((t) => t.status !== 'done').length
  const overdueTasks = caseTasks.filter(
    (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
  ).length
  const reviewTasks = caseTasks.filter((t) => t.status === 'review').length
  const daysInStage = differenceInDays(now, parseISO(c.stageEnteredAt))

  const stage = STAGE_MAP.get(c.stage)
  let health: HealthStatus = 'green'

  if (stage) {
    if (daysInStage >= stage.criticalThresholdDays || overdueTasks >= 3) {
      health = 'red'
    } else if (daysInStage >= stage.stuckThresholdDays || overdueTasks >= 1) {
      health = 'yellow'
    }
  }

  return { daysInStage, openTasks, overdueTasks, reviewTasks, health }
}
