import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string; disabled?: boolean }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => (
    <label className="flex flex-col gap-1.5 text-sm">
      {label && <span className="font-medium text-[var(--color-text)]">{label}</span>}
      <select
        ref={ref}
        id={id}
        className={cn(
          'h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-50',
          error && 'border-[var(--color-danger)]',
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </label>
  ),
)
Select.displayName = 'Select'
