import { useStore } from './store/useStore'
import { CaseKanban } from './components/CaseKanban/CaseKanban'
import { TaskKanban } from './components/TaskKanban/TaskKanban'
import { SkipStageModal } from './components/SkipStageModal'
import { AuditDrawer } from './components/AuditDrawer'
import { Scale } from 'lucide-react'

function Header() {
  const { cases, tasks } = useStore()
  const now = new Date()
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
  ).length
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length
  const activeCases = cases.filter((c) => c.stage !== 'closed').length

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0 bg-surface-1">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <Scale size={15} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-100 leading-tight">Case Control</h1>
          <p className="text-[10px] text-gray-600">Law Firm Workflow Dashboard</p>
        </div>
      </div>

      {/* Global stats */}
      <div className="flex items-center gap-4">
        <Stat label="Active Cases" value={activeCases} />
        <Stat label="Overdue Tasks" value={overdueTasks} highlight={overdueTasks > 0 ? 'red' : undefined} />
        <Stat label="Blocked Tasks" value={blockedTasks} highlight={blockedTasks > 0 ? 'amber' : undefined} />
      </div>
    </header>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'amber' }) {
  const cls = highlight === 'red'
    ? 'text-red-400'
    : highlight === 'amber'
    ? 'text-amber-400'
    : 'text-gray-200'
  return (
    <div className="text-center">
      <p className={`text-sm font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="text-[10px] text-gray-600">{label}</p>
    </div>
  )
}

function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-0">
      <Header />

      {/* Two-panel layout: top 55% case board, bottom 45% task board */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Case Workflow Board */}
        <div className="flex flex-col border-b border-white/8" style={{ flex: '0 0 55%', minHeight: 0 }}>
          <CaseKanban />
        </div>

        {/* Task Board */}
        <div className="flex flex-col" style={{ flex: '0 0 45%', minHeight: 0 }}>
          <TaskKanban />
        </div>
      </div>

      {/* Modals & Drawers */}
      <SkipStageModal />
      <AuditDrawer />
    </div>
  )
}

export default App
