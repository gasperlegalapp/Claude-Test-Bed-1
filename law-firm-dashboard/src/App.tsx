import { useStore } from './store/useStore'
import { CaseKanban } from './components/CaseKanban/CaseKanban'
import { TaskKanban } from './components/TaskKanban/TaskKanban'
import { SkipStageModal } from './components/SkipStageModal'
import { AuditDrawer } from './components/AuditDrawer'
import { Scale, AlertTriangle, CheckSquare, Briefcase } from 'lucide-react'

function Stat({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string
  value: number
  icon: React.ElementType
  highlight?: 'red' | 'amber' | 'blue'
}) {
  const valueColor =
    highlight === 'red'
      ? 'text-red-400'
      : highlight === 'amber'
      ? 'text-amber-400'
      : highlight === 'blue'
      ? 'text-blue-400'
      : 'text-gray-100'

  const iconColor =
    highlight === 'red'
      ? 'text-red-500'
      : highlight === 'amber'
      ? 'text-amber-500'
      : highlight === 'blue'
      ? 'text-blue-500'
      : 'text-gray-500'

  return (
    <div className="stat-card">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={12} className={iconColor} />
        <p className={`text-base font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
      </div>
      <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
    </div>
  )
}

function Header() {
  const { cases, tasks } = useStore()
  const now = new Date()
  const overdueTasks = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
  ).length
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').length
  const activeCases = cases.filter((c) => c.stage !== 'closed').length

  return (
    <header
      className="flex items-center justify-between px-5 py-3 flex-shrink-0"
      style={{
        background: 'linear-gradient(90deg, #0e1422 0%, #141c30 40%, #141c30 60%, #0e1422 100%)',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
        boxShadow: '0 1px 20px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.05)',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            boxShadow: '0 0 16px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <Scale size={16} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-100 leading-tight tracking-wide">
            Case Control
          </h1>
          <p className="text-[10px] text-indigo-400/70 leading-tight">Law Firm Workflow Dashboard</p>
        </div>
      </div>

      {/* Global stats */}
      <div className="flex items-center gap-2">
        <Stat label="Active Cases" value={activeCases} icon={Briefcase} highlight="blue" />
        <Stat
          label="Overdue Tasks"
          value={overdueTasks}
          icon={AlertTriangle}
          highlight={overdueTasks > 0 ? 'red' : undefined}
        />
        <Stat
          label="Blocked Tasks"
          value={blockedTasks}
          icon={CheckSquare}
          highlight={blockedTasks > 0 ? 'amber' : undefined}
        />
      </div>
    </header>
  )
}

function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0b0e18' }}>
      <Header />

      {/* Two-panel layout: top 55% case board, bottom 45% task board */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Case Workflow Board */}
        <div
          className="flex flex-col"
          style={{ flex: '0 0 55%', minHeight: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
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
