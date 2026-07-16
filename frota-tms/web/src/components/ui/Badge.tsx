import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary'
}

const tones: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]',
  success: 'bg-green-500/15 text-[var(--color-success)] border-green-500/30',
  warning: 'bg-amber-500/15 text-[var(--color-warning)] border-amber-500/30',
  danger: 'bg-red-500/15 text-[var(--color-danger)] border-red-500/30',
  info: 'bg-blue-500/15 text-[var(--color-info)] border-blue-500/30',
  primary: 'bg-[var(--color-primary-muted)] text-[var(--color-primary)] border-[var(--color-primary)]/30',
}

export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
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

/** Minimal surface container — used only as interactive/content grouping when needed */
export function Card({ children, className, title, action }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {title && <h3 className="font-display text-sm font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
