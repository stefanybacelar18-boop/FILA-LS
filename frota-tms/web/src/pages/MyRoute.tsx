import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { Button, Input } from '../components/ui'
import { formatDate } from '../lib/format'

const MATRICULA_KEY = 'frotatms-meu-roteiro-matricula'

const ORDER_WARNING =
  'A sequência de entrega deve ser seguida conforme a ordem dos clientes no Manifesto de Carga. O FrotaTMS não realiza a otimização automática da rota.'

type Destination = {
  name: string
  city: string
  state: string
  motoCount: number | null
}

type DriverRouteCard = {
  tripId: string
  routeName: string
  plate: string
  manifestNumber: string | null
  deliveryCount: number
  routeDate: string
  departureAt?: string
  expectedReturnAt?: string | null
  hasPriority?: boolean
  priorityExpiryDate?: string | null
  orderDefined: boolean
  orderNote: string
  destinations: Destination[]
}

type LookupResult = {
  found: boolean
  driverName: string
  message?: string | null
  orderWarning?: string
  routes: DriverRouteCard[]
}

function usePublicMobileShell() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('public-mobile')
    return () => root.classList.remove('public-mobile')
  }, [])
}

function deliveryLabel(count: number) {
  if (count === 1) return '1 entrega'
  return `${count} entregas`
}

/**
 * Meu roteiro — consulta pela matrícula do motorista LSL, no celular.
 * Mostra os roteiros em aberto no nome dele, até a operação marcar o retorno.
 */
export function MyRoute() {
  usePublicMobileShell()
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [matricula, setMatricula] = useState(() => {
    try {
      return localStorage.getItem(MATRICULA_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = result?.routes.find((route) => route.tripId === selectedId) ?? null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult(null)
    setSelectedId(null)
    setLoading(true)
    const matriculaClean = matricula.trim()
    try {
      localStorage.setItem(MATRICULA_KEY, matriculaClean)
    } catch {
      // ignore
    }
    try {
      const res = await fetch('/api/public/meu-roteiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula: matriculaClean, pin: pin.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<LookupResult> & { error?: string }
      if (!res.ok) {
        setError(data.error || 'Não foi possível consultar.')
        return
      }
      setResult({
        found: Boolean(data.found),
        driverName: data.driverName || matriculaClean,
        message: data.message,
        orderWarning: data.orderWarning,
        routes: data.routes ?? [],
      })
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
          aria-label="Tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="flex flex-1 flex-col pt-10">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Frota<span className="text-[var(--color-primary)]">TMS</span>
            </h1>
          </div>

          {!result && (
            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                id="driver-matricula"
                name="matricula"
                label="Sua matrícula"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Sua matrícula"
                required
                className="h-12 max-w-full text-base"
              />
              <Input
                id="driver-pin"
                name="pin"
                label="Senha"
                type="password"
                inputMode="text"
                autoComplete="current-password"
                enterKeyHint="go"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                className="h-12 max-w-full text-base"
              />
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <Button type="submit" size="xl" className="w-full" loading={loading}>
                Ver meus roteiros
              </Button>
            </form>
          )}

          {result && !selected && (
            <div className="min-w-0 space-y-4">
              <div>
                <p className="text-base font-semibold break-words">{result.driverName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Roteiros em aberto</p>
              </div>

              {result.routes.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                  {result.message ||
                    'Nenhum roteiro em aberto.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {result.routes.map((route) => (
                    <li
                      key={route.tripId}
                      className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <p className="text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                        Roteiro
                      </p>
                      <p className="mt-1 break-words text-lg font-semibold">{route.routeName}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {formatDate(route.routeDate)}
                        {route.departureAt ? ` · saída ${route.departureAt}` : ''}
                      </p>
                      {route.hasPriority && (
                        <p className="mt-1 text-sm font-medium text-[var(--color-danger)]">
                          Prioridade
                          {route.priorityExpiryDate
                            ? ` · venc. ${formatDate(route.priorityExpiryDate)}`
                            : ''}
                        </p>
                      )}
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--color-text-muted)]">Placa</dt>
                          <dd className="font-medium">{route.plate}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--color-text-muted)]">Manifesto</dt>
                          <dd className="font-medium break-words">
                            {route.manifestNumber ?? 'Sem número'}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-[var(--color-text-muted)]">Entregas</dt>
                          <dd className="font-medium">{deliveryLabel(route.deliveryCount)}</dd>
                        </div>
                      </dl>
                      <Button
                        type="button"
                        size="xl"
                        className="mt-4 w-full"
                        onClick={() => setSelectedId(route.tripId)}
                      >
                        Consultar roteiro
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setResult(null)
                  setSelectedId(null)
                  setError('')
                }}
              >
                Consultar outra matrícula
              </Button>
            </div>
          )}

          {selected && (
            <div className="min-w-0 space-y-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar aos roteiros
              </button>

              <div
                className="rounded-[var(--radius)] border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-3 text-sm font-medium text-[var(--color-text)]"
                role="note"
              >
                {result?.orderWarning || ORDER_WARNING}
              </div>

              <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                  Roteiro
                </p>
                <p className="mt-1 break-words text-lg font-semibold">{selected.routeName}</p>
                {selected.hasPriority && (
                  <p className="mt-1 text-sm font-medium text-[var(--color-danger)]">
                    Prioridade
                    {selected.priorityExpiryDate
                      ? ` · venc. ${formatDate(selected.priorityExpiryDate)}`
                      : ''}
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--color-text-muted)]">Placa</dt>
                    <dd className="font-medium">{selected.plate}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-text-muted)]">Manifesto</dt>
                    <dd className="font-medium break-words">
                      {selected.manifestNumber ?? 'Sem número de manifesto'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-text-muted)]">Data</dt>
                    <dd className="font-medium">
                      {formatDate(selected.routeDate)}
                      {selected.departureAt ? ` · ${selected.departureAt}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-text-muted)]">Retorno previsto</dt>
                    <dd className="font-medium">
                      {selected.expectedReturnAt ? formatDate(selected.expectedReturnAt) : '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <p className="text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                  Entregas
                </p>
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  {selected.orderDefined
                    ? 'Ordem conforme o manifesto.'
                    : selected.orderNote}
                </p>
                {selected.destinations.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">Sem entregas neste roteiro.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {selected.destinations.map((stop, index) => (
                      <li
                        key={`${stop.name}-${stop.city}-${index}`}
                        className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
                      >
                        <p className="break-words font-medium">{stop.city}</p>
                        <p className="break-words text-sm text-[var(--color-text-muted)]">
                          {stop.name}
                          {stop.state ? ` · ${stop.state}` : ''}
                          {stop.motoCount != null ? ` · ${stop.motoCount} motos` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <p className="mt-auto pt-8 text-center text-sm text-[var(--color-text-muted)]">
            <Link to="/login" className="text-[var(--color-primary)] hover:underline">
              Entrar no sistema
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
