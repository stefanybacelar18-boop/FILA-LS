import { cn } from '../../lib/cn'
import type { ChecklistItemDef, ChecklistState } from '../../types/logbook'

type ChecklistFormProps = {
  items: ChecklistItemDef[]
  value: ChecklistState
  onChange: (next: ChecklistState) => void
  disabled?: boolean
}

export function ChecklistForm({ items, value, onChange, disabled }: ChecklistFormProps) {
  function setItem(id: string, patch: Partial<ChecklistState[string]>) {
    onChange({ ...value, [id]: { ...value[id], ...patch } })
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const row = value[item.id] ?? {}
        return (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <p className="mb-2 text-sm leading-snug">{item.label}</p>
            <div className="flex flex-wrap items-center gap-2">
              {(['OK', 'NG'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  disabled={disabled}
                  onClick={() => setItem(item.id, { status: st })}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                    row.status === st
                      ? st === 'OK'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
                  )}
                >
                  {st}
                </button>
              ))}
              {item.requiresQty && (
                <label className="ml-auto flex items-center gap-1 text-xs">
                  Qtd
                  <input
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={row.qty ?? ''}
                    onChange={(e) =>
                      setItem(item.id, {
                        qty: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    className="w-14 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                  />
                </label>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
