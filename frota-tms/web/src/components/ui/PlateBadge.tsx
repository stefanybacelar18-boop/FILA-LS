import { cn } from '../../lib/cn'
import type { PlateColor } from '../../types'
import { plateColorLabels } from '../../lib/labels'
import { plateOwner, type PlateOwner } from '../../lib/plateOwner'

interface PlateBadgeProps {
  plate: string
  color?: PlateColor
  showTooltip?: boolean
  className?: string
  /** Exibe selo LSL ou AG (padrão: ligado) */
  showOwner?: boolean
  owner?: PlateOwner
}

export function PlateBadge({
  plate,
  color = 'green',
  showTooltip = true,
  className,
  showOwner = true,
  owner,
}: PlateBadgeProps) {
  const resolvedOwner = owner ?? plateOwner(plate)
  const ownerLabel = resolvedOwner === 'LSL' ? 'LSL' : 'AG'
  const tip = showTooltip
    ? `${plateColorLabels[color]} · frota ${ownerLabel}`
    : undefined

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span
        title={tip}
        className={cn(
          'inline-flex min-w-[5.5rem] items-center justify-center rounded px-2 py-1 font-display text-xs font-bold tracking-wider uppercase',
          `plate-${color}`,
        )}
      >
        {plate}
      </span>
      {showOwner && (
        <span
          title={resolvedOwner === 'LSL' ? 'Frota LSL (só Admin)' : 'Frota AG (Operação)'}
          className={cn(
            'inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
            resolvedOwner === 'LSL'
              ? 'bg-slate-800 text-white'
              : 'bg-teal-700/15 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200',
          )}
        >
          {ownerLabel}
        </span>
      )}
    </span>
  )
}
