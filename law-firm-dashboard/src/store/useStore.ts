import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  Case,
  Task,
  AuditEntry,
  CaseStageId,
  TaskStatus,
  CaseFilters,
  CaseMetrics,
  HealthStatus,
} from '../types'
import { INITIAL_CASES } from '../data/mockData'
import { INITIAL_TASKS } from '../data/mockData'
import { INITIAL_AUDIT } from '../data/mockData'
import { STAGES, STAGE_MAP } from '../data/stages'
import { computeMetrics } from '../utils/health'

// ─── State shape ─────────────────────────────────────────────────────────────

interface AppState {
  cases: Case[]
  tasks: Task[]
  auditLog: AuditEntry[]

  selectedCaseId: string | null
  filters: CaseFilters

  // Modal state for skip-stage
  skipModal: {
    open: boolean
    caseId: string | null
    targetStage: CaseStageId | null
  }

  // Audit-log drawer
  auditDrawerOpen: boolean
  auditDrawerCaseId: string | null

  // ─── Selectors ──────────────────────────────────────────────────────────
  getMetrics: (caseId: string) => CaseMetrics
  getFilteredCases: () => Case[]
  getTasksForCase: (caseId: string | null) => Task[]
  getAllOwners: () => string[]

  // ─── Actions ────────────────────────────────────────────────────────────
  selectCase: (id: string | null) => void
  setFilter: <K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) => void
  resetFilters: () => void

  moveCase: (caseId: string, toStage: CaseStageId) => void
  openSkipModal: (caseId: string, targetStage: CaseStageId) => void
  closeSkipModal: () => void
  confirmSkip: (reason: string) => void

  moveTask: (taskId: string, toStatus: TaskStatus) => void
  addTask: (task: Task) => void
  updateTask: (taskId: string, patch: Partial<Task>) => void

  openAuditDrawer: (caseId: string) => void
  closeAuditDrawer: () => void
}

// ─── Default filters ─────────────────────────────────────────────────────────

const DEFAULT_FILTERS: CaseFilters = {
  stage: 'all',
  owner: 'all',
  health: 'all',
  stuckDays: null,
  search: '',
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  immer((set, get) => ({
    cases: INITIAL_CASES,
    tasks: INITIAL_TASKS,
    auditLog: INITIAL_AUDIT,
    selectedCaseId: null,
    filters: { ...DEFAULT_FILTERS },
    skipModal: { open: false, caseId: null, targetStage: null },
    auditDrawerOpen: false,
    auditDrawerCaseId: null,

    // ─── Selectors ────────────────────────────────────────────────────────

    getMetrics(caseId) {
      const { cases, tasks } = get()
      const c = cases.find((x) => x.id === caseId)
      if (!c) return { daysInStage: 0, openTasks: 0, overdueTasks: 0, reviewTasks: 0, health: 'green' as HealthStatus }
      return computeMetrics(c, tasks)
    },

    getFilteredCases() {
      const { cases, tasks, filters } = get()
      return cases.filter((c) => {
        if (filters.stage !== 'all' && c.stage !== filters.stage) return false
        if (filters.owner !== 'all' && c.owner !== filters.owner) return false
        if (filters.health !== 'all') {
          const m = computeMetrics(c, tasks)
          if (m.health !== filters.health) return false
        }
        if (filters.stuckDays !== null) {
          const m = computeMetrics(c, tasks)
          if (m.daysInStage < filters.stuckDays) return false
        }
        if (filters.search) {
          const q = filters.search.toLowerCase()
          if (
            !c.title.toLowerCase().includes(q) &&
            !c.caseNumber.toLowerCase().includes(q) &&
            !c.client.toLowerCase().includes(q)
          )
            return false
        }
        return true
      })
    },

    getTasksForCase(caseId) {
      const { tasks } = get()
      if (!caseId) return tasks
      return tasks.filter((t) => t.caseId === caseId)
    },

    getAllOwners() {
      const { cases } = get()
      return [...new Set(cases.map((c) => c.owner))].sort()
    },

    // ─── Actions ──────────────────────────────────────────────────────────

    selectCase(id) {
      set((s) => {
        s.selectedCaseId = s.selectedCaseId === id ? null : id
      })
    },

    setFilter(key, value) {
      set((s) => {
        s.filters[key] = value as never
      })
    },

    resetFilters() {
      set((s) => {
        s.filters = { ...DEFAULT_FILTERS }
      })
    },

    moveCase(caseId, toStage) {
      set((s) => {
        const c = s.cases.find((x) => x.id === caseId)
        if (!c) return
        const fromStage = c.stage
        const stageList = STAGES.map((st) => st.id)
        const fromIdx = stageList.indexOf(fromStage)
        const toIdx = stageList.indexOf(toStage)

        // If jumping more than one stage, prompt skip modal instead
        if (Math.abs(toIdx - fromIdx) > 1) {
          s.skipModal = { open: true, caseId, targetStage: toStage }
          return
        }

        c.stage = toStage
        c.stageEnteredAt = new Date().toISOString()
        c.lastActivity = new Date().toISOString()

        // Default to first step/substep of new stage
        const stage = STAGE_MAP.get(toStage)
        if (stage && stage.steps.length > 0) {
          c.stepId = stage.steps[0].id
          c.subStepId = stage.steps[0].subSteps[0]?.id ?? ''
        }

        s.auditLog.push({
          id: `audit-${Date.now()}`,
          caseId,
          type: 'stage_change',
          fromStage,
          toStage,
          actor: 'Current User',
          timestamp: new Date().toISOString(),
          description: `Stage changed: ${fromStage} → ${toStage}`,
        })
      })
    },

    openSkipModal(caseId, targetStage) {
      set((s) => {
        s.skipModal = { open: true, caseId, targetStage }
      })
    },

    closeSkipModal() {
      set((s) => {
        s.skipModal = { open: false, caseId: null, targetStage: null }
      })
    },

    confirmSkip(reason) {
      set((s) => {
        const { caseId, targetStage } = s.skipModal
        if (!caseId || !targetStage) return

        const c = s.cases.find((x) => x.id === caseId)
        if (!c) return

        const fromStage = c.stage
        c.stage = targetStage
        c.stageEnteredAt = new Date().toISOString()
        c.lastActivity = new Date().toISOString()

        const stage = STAGE_MAP.get(targetStage)
        if (stage && stage.steps.length > 0) {
          c.stepId = stage.steps[0].id
          c.subStepId = stage.steps[0].subSteps[0]?.id ?? ''
        }

        s.auditLog.push({
          id: `audit-${Date.now()}`,
          caseId,
          type: 'stage_skip',
          fromStage,
          toStage: targetStage,
          reason,
          actor: 'Current User',
          timestamp: new Date().toISOString(),
          description: `Stage skipped: ${fromStage} → ${targetStage}`,
        })

        s.skipModal = { open: false, caseId: null, targetStage: null }
      })
    },

    moveTask(taskId, toStatus) {
      set((s) => {
        const t = s.tasks.find((x) => x.id === taskId)
        if (t) {
          t.status = toStatus
          t.updatedAt = new Date().toISOString()
        }
      })
    },

    addTask(task) {
      set((s) => {
        s.tasks.push(task)
      })
    },

    updateTask(taskId, patch) {
      set((s) => {
        const t = s.tasks.find((x) => x.id === taskId)
        if (t) {
          Object.assign(t, patch)
          t.updatedAt = new Date().toISOString()
        }
      })
    },

    openAuditDrawer(caseId) {
      set((s) => {
        s.auditDrawerOpen = true
        s.auditDrawerCaseId = caseId
      })
    },

    closeAuditDrawer() {
      set((s) => {
        s.auditDrawerOpen = false
        s.auditDrawerCaseId = null
      })
    },
  })),
)
