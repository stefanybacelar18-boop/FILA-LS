import type { ChecklistItemDef, ChecklistState } from '../../types/logbook'
import { cn } from '../../lib/cn'

function cellLabel(state: ChecklistState[string] | undefined) {
  if (!state?.status) return '—'
  const q = state.qty != null ? ` · qtd ${state.qty}` : ''
  return `${state.status}${q}`
}

export function ChecklistReviewTable({
  items,
  departure,
  returnState,
}: {
  items: ChecklistItemDef[]
  departure: ChecklistState
  returnState: ChecklistState
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="sticky top-0 bg-[var(--color-surface-2)]">
          <tr>
            <th className="px-2 py-2 font-medium">Item</th>
            <th className="px-2 py-2 font-medium">Saída</th>
            <th className="px-2 py-2 font-medium">Retorno</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]/60">
          {items.map((item) => {
            const dep = departure[item.id]
            const ret = returnState[item.id]
            const ng = dep?.status === 'NG' || ret?.status === 'NG'
            return (
              <tr key={item.id} className={cn(ng && 'bg-red-500/5')}>
                <td className="px-2 py-1.5">{item.label}</td>
                <td className="px-2 py-1.5 font-medium">{cellLabel(dep)}</td>
                <td className="px-2 py-1.5 font-medium">{cellLabel(ret)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
