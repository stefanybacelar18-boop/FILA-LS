import { cn } from '../../lib/cn'
import type { PlateColor } from '../../types'
import { plateColorLabels } from '../../lib/labels'

interface PlateBadgeProps {
  plate: string
  color?: PlateColor
  showTooltip?: boolean
  className?: string
}

export function PlateBadge({ plate, color = 'green', showTooltip = true, className }: PlateBadgeProps) {
  return (
    <span
      title={showTooltip ? plateColorLabels[color] : undefined}
      className={cn(
        'inline-flex min-w-[5.5rem] items-center justify-center rounded px-2 py-1 font-display text-xs font-bold tracking-wider uppercase',
        `plate-${color}`,
        className,
      )}
    >
      {plate}
    </span>
  )
}
