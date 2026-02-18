import { Search, RotateCcw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { STAGES } from '../data/stages'
import type { CaseStageId, HealthStatus } from '../types'

export function FilterBar() {
  const { filters, setFilter, resetFilters, getAllOwners } = useStore()
  const owners = getAllOwners()

  const hasActiveFilters =
    filters.stage !== 'all' ||
    filters.owner !== 'all' ||
    filters.health !== 'all' ||
    filters.stuckDays !== null ||
    filters.search !== ''

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 flex-wrap flex-shrink-0">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search cases..."
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          className="filter-select pl-7 w-44"
        />
      </div>

      {/* Stage filter */}
      <select
        value={filters.stage}
        onChange={(e) => setFilter('stage', e.target.value as CaseStageId | 'all')}
        className="filter-select"
      >
        <option value="all">All Stages</option>
        {STAGES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {/* Owner filter */}
      <select
        value={filters.owner}
        onChange={(e) => setFilter('owner', e.target.value)}
        className="filter-select"
      >
        <option value="all">All Owners</option>
        {owners.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      {/* Health filter */}
      <select
        value={filters.health}
        onChange={(e) => setFilter('health', e.target.value as HealthStatus | 'all')}
        className="filter-select"
      >
        <option value="all">All Health</option>
        <option value="green">Healthy</option>
        <option value="yellow">At Risk</option>
        <option value="red">Critical</option>
      </select>

      {/* Stuck days filter */}
      <select
        value={filters.stuckDays ?? ''}
        onChange={(e) => setFilter('stuckDays', e.target.value ? Number(e.target.value) : null)}
        className="filter-select"
      >
        <option value="">Any Duration</option>
        <option value="7">Stuck &gt; 7 days</option>
        <option value="14">Stuck &gt; 14 days</option>
        <option value="21">Stuck &gt; 21 days</option>
        <option value="30">Stuck &gt; 30 days</option>
      </select>

      {/* Reset */}
      {hasActiveFilters && (
        <button onClick={resetFilters} className="btn-ghost text-xs gap-1">
          <RotateCcw size={12} />
          Reset
        </button>
      )}
    </div>
  )
}
