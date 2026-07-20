import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-medium text-[var(--color-text)]">{label}</span>}
      <input
        ref={ref}
        id={id}
        className={cn(
          'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-50',
          error && 'border-[var(--color-danger)]',
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  ),
)
Input.displayName = 'Input'
