// ─── Stage Hierarchy ────────────────────────────────────────────────────────

export type CaseStageId =
  | 'intake'
  | 'assessment'
  | 'discovery'
  | 'negotiation'
  | 'litigation'
  | 'resolution'
  | 'closed'

export interface SubStep {
  id: string
  label: string
}

export interface Step {
  id: string
  label: string
  subSteps: SubStep[]
}

export interface CaseStage {
  id: CaseStageId
  label: string
  color: string         // Tailwind bg class for column accent
  textColor: string     // Tailwind text class
  accentBorder: string  // Tailwind border-t color class for column top strip
  accentBg: string      // Tailwind bg class for column header background
  stuckThresholdDays: number   // Days before Yellow health
  criticalThresholdDays: number // Days before Red health
  steps: Step[]
}

// ─── Task ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'in_progress' | 'waiting' | 'review' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  caseId: string
  title: string
  status: TaskStatus
  assignee: string
  dueDate: string          // ISO date string
  priority: TaskPriority
  notes: string
  createdAt: string        // ISO datetime
  updatedAt: string        // ISO datetime
}

// ─── Case ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'green' | 'yellow' | 'red'

export interface Case {
  id: string
  caseNumber: string
  title: string
  client: string
  owner: string
  stage: CaseStageId
  stepId: string
  subStepId: string
  stageEnteredAt: string   // ISO datetime — when this stage started
  lastActivity: string     // ISO datetime
  tags: string[]
}

// Derived / computed from Case + Tasks
export interface CaseMetrics {
  daysInStage: number
  openTasks: number
  overdueTasks: number
  reviewTasks: number
  health: HealthStatus
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  caseId: string
  type: 'stage_change' | 'stage_skip' | 'task_complete' | 'note'
  fromStage?: CaseStageId
  toStage?: CaseStageId
  reason?: string
  actor: string
  timestamp: string    // ISO datetime
  description: string
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export interface CaseFilters {
  stage: CaseStageId | 'all'
  owner: string | 'all'
  health: HealthStatus | 'all'
  stuckDays: number | null   // Show only cases stuck >= N days
  search: string
}
