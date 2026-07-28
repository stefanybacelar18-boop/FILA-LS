import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { Button, Input } from '../components/ui'
import { formatDate } from '../lib/format'

type LookupResult = {
  found: boolean
  plate: string
  routeDate: string
  message?: string
  fleet?: string
  routeName?: string
  departureAt?: string
  expectedReturnAt?: string | null
  driverName?: string | null
  hasPriority?: boolean
  priorityExpiryDate?: string | null
  status?: string
  destinations?: { name: string; city: string; state: string }[]
}

export function MyRoute() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [plate, setPlate] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const res = await fetch('/api/public/meu-roteiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: plate.trim(), pin: pin.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as LookupResult & { error?: string }
      if (!res.ok) {
        setError(data.error || 'Não foi possível consultar.')
        return
      }
      setResult(data)
    } catch {
      setError('Falha de conexão. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
        aria-label="Tema"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Frota<span className="text-[var(--color-primary)]">TMS</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Meu roteiro — frota LSL · consulta do dia seguinte
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Placa"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="Ex.: EZU2D86"
            required
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Ver roteiro de amanhã
          </Button>
        </form>

        {result && (
          <div className="mt-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            {!result.found ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {result.message || 'Nenhum roteiro para amanhã nesta placa.'}
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Roteiro
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">
                    {result.routeName}
                  </p>
                  {result.hasPriority && (
                    <p className="mt-1 text-sm font-medium text-[var(--color-danger)]">
                      Prioridade
                      {result.priorityExpiryDate
                        ? ` · venc. ${formatDate(result.priorityExpiryDate)}`
                        : ''}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">Data</p>
                    <p className="font-medium">{formatDate(result.routeDate)} · {result.departureAt}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">Retorno previsto</p>
                    <p className="font-medium">
                      {result.expectedReturnAt ? formatDate(result.expectedReturnAt) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">Placa</p>
                    <p className="font-medium">{result.plate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">Motorista</p>
                    <p className="font-medium">{result.driverName || '—'}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Destinos
                  </p>
                  {(result.destinations?.length ?? 0) === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">Sem destinos</p>
                  ) : (
                    <ul className="space-y-2">
                      {result.destinations!.map((d, i) => (
                        <li
                          key={`${d.name}-${i}`}
                          className="flex items-start gap-2 text-sm text-[var(--color-text)]"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                          <span>
                            <span className="font-medium">{d.city}</span>
                            <span className="text-[var(--color-text-muted)]"> · {d.name}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          <Link to="/login" className="text-[var(--color-primary)] hover:underline">
            Entrar no sistema
          </Link>
        </p>
      </div>
    </div>
  )
}
