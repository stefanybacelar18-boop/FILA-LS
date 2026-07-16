import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
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
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-[var(--color-text-muted)]',
        className,
      )}
    >
      <div className="mb-1 text-[var(--color-border-strong)]">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <p className="font-display text-sm font-semibold text-[var(--color-text)]">{title}</p>
      <p className="max-w-sm text-sm">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
