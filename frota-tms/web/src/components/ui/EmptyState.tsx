import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title = 'Nenhum registro',
  description = 'Não há dados para exibir no momento.',
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center text-[var(--color-text-muted)]',
        className,
      )}
    >
      {icon && <div className="mb-1 opacity-40">{icon}</div>}
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="max-w-sm text-sm">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
