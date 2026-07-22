import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface ComboboxProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyMessage?: string
  error?: string
  disabled?: boolean
}

/** Campo digitável com sugestões filtradas (placa / motorista). */
export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = 'Digite para buscar…',
  emptyMessage = 'Nenhum resultado',
  error,
  disabled,
}: ComboboxProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selected?.label ?? '')
  }, [selected?.label, value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!q) return options.slice(0, 40)
    return options
      .filter((o) => {
        const hay = `${o.label} ${o.description ?? ''}`.toLowerCase()
        return hay.includes(q) || o.value.toLowerCase().includes(q)
      })
      .slice(0, 40)
  }, [options, query])

  function pick(opt: ComboboxOption) {
    if (opt.disabled) return
    onChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5 text-sm">
      {label && (
        <label htmlFor={id} className="font-medium text-[var(--color-text)]">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (value) onChange('')
        }}
        className={cn(
          'h-10 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:opacity-50',
          error && 'border-[var(--color-danger)]',
        )}
      />
      {open && !disabled && (
        <ul className="absolute top-full z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{emptyMessage}</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  disabled={o.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--color-surface-2)]',
                    o.value === value && 'bg-[var(--color-primary-muted)]',
                    o.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="font-medium">{o.label}</span>
                  {o.description && (
                    <span className="text-xs text-[var(--color-text-muted)]">{o.description}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  )
}
