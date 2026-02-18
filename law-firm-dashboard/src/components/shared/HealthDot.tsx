import type { HealthStatus } from '../../types'

interface Props {
  health: HealthStatus
  size?: 'sm' | 'md'
}

const CONFIG: Record<HealthStatus, { bg: string; ring: string; label: string }> = {
  green:  { bg: 'bg-emerald-400', ring: 'ring-emerald-400/30', label: 'Healthy' },
  yellow: { bg: 'bg-amber-400',   ring: 'ring-amber-400/30',   label: 'At Risk' },
  red:    { bg: 'bg-red-500',     ring: 'ring-red-500/30',     label: 'Critical' },
}

export function HealthDot({ health, size = 'sm' }: Props) {
  const c = CONFIG[health]
  const dim = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  return (
    <span
      title={c.label}
      className={`inline-block rounded-full ring-2 ${dim} ${c.bg} ${c.ring} flex-shrink-0`}
    />
  )
}
