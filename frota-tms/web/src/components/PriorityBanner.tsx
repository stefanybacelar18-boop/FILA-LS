import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { ProductsPanel } from '../types'
import { cn } from '../lib/cn'

const ROUTING_PATHS = ['/roteiros', '/definir-placas', '/produtos', '/viagens', '/retornos']

export function PriorityBanner() {
  const location = useLocation()
  const show = ROUTING_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  )

  const { data } = useQuery({
    queryKey: ['products', 'panel'],
    queryFn: async () => (await api.get<ProductsPanel>('/products/panel')).data,
    enabled: show,
    staleTime: 30_000,
  })

  if (!show || !data) return null

  const urgent = [...data.expired, ...data.today, ...data.in7].slice(0, 8)
  if (urgent.length === 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-[var(--radius)] border border-amber-500/40 bg-amber-500/10">
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-sm font-semibold text-amber-800 dark:text-amber-200">
              Produtos prioritários urgentes
            </p>
            <Link
              to="/produtos"
              className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
            >
              Ver painel
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {urgent.map((p) => (
              <span
                key={p.id}
                className={cn(
                  'rounded border border-amber-500/30 bg-[var(--color-surface)] px-2 py-1 text-xs',
                  p.blinking && 'animate-blink',
                  p.daysRemaining < 0 && 'priority-expired',
                  p.daysRemaining >= 0 && p.daysRemaining < 7 && 'priority-red font-semibold',
                )}
              >
                {p.product} · {p.daysRemaining < 0 ? 'vencido' : `${p.daysRemaining}d`}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
