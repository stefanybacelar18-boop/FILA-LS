import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'
}

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
  success: 'bg-green-500/10 text-[var(--color-success)]',
  warning: 'bg-amber-500/10 text-[var(--color-warning)]',
  danger: 'bg-red-500/10 text-[var(--color-danger)]',
  info: 'bg-blue-500/10 text-[var(--color-info)]',
  primary: 'bg-[var(--color-primary-muted)] text-[var(--color-primary)]',
}

export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}

/** Surface leve — sem sombra nem borda forte */
export function Card({ children, className, title, action }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
