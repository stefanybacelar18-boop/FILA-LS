import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { Button, Input } from '../components/ui'
import { formatDate } from '../lib/format'

const PLATE_KEY = 'frotatms-meu-roteiro-placa'

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

/** Página pública mobile-first — motorista LSL consulta o roteiro de amanhã. */
export function MyRoute() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [plate, setPlate] = useState(() => {
    try {
      return localStorage.getItem(PLATE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!result) return
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    const plateClean = plate.trim().toUpperCase()
    try {
      localStorage.setItem(PLATE_KEY, plateClean)
    } catch {
      // ignore
    }
    try {
      const res = await fetch('/api/public/meu-roteiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: plateClean, pin: pin.trim() }),
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
    <div className="min-h-[100dvh] bg-[var(--color-bg)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <header className="mb-6 flex items-start justify-between gap-3 pt-2">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Frota<span className="text-[var(--color-primary)]">TMS</span>
            </h1>
            <p className="mt-1 text-base text-[var(--color-text-muted)]">
              Meu roteiro · LSL · amanhã
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            aria-label="Tema"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Placa"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="Ex.: EZU2D86"
            required
            className="h-12 text-base tracking-wide"
          />
          <Input
            label="Senha"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            enterKeyHint="go"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            className="h-12 text-base"
          />
          {error && (
            <p className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2.5 text-base text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <Button type="submit" size="xl" className="h-14 w-full text-base" loading={loading}>
            Ver roteiro de amanhã
          </Button>
        </form>

        {result && (
          <div
            ref={resultRef}
            className="mt-6 scroll-mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-5"
          >
            {!result.found ? (
              <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
                {result.message || 'Nenhum roteiro para amanhã nesta placa.'}
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                    Roteiro
                  </p>
                  <p className="mt-1 text-xl font-semibold leading-snug text-[var(--color-text)]">
                    {result.routeName}
                  </p>
                  {result.hasPriority && (
                    <p className="mt-2 inline-flex rounded-md bg-[var(--color-danger)]/10 px-2.5 py-1 text-sm font-semibold text-[var(--color-danger)]">
                      Prioridade
                      {result.priorityExpiryDate
                        ? ` · venc. ${formatDate(result.priorityExpiryDate)}`
                        : ''}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Saída</p>
                    <p className="mt-0.5 text-lg font-semibold">
                      {formatDate(result.routeDate)}
                      <span className="text-[var(--color-text-muted)]"> · </span>
                      {result.departureAt}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Retorno previsto</p>
                    <p className="mt-0.5 text-lg font-semibold">
                      {result.expectedReturnAt ? formatDate(result.expectedReturnAt) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Placa</p>
                    <p className="mt-0.5 text-lg font-semibold tracking-wide">{result.plate}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Motorista</p>
                    <p className="mt-0.5 text-base font-semibold leading-snug">
                      {result.driverName || '—'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                    Destinos ({result.destinations?.length ?? 0})
                  </p>
                  {(result.destinations?.length ?? 0) === 0 ? (
                    <p className="text-base text-[var(--color-text-muted)]">Sem destinos</p>
                  ) : (
                    <ol className="space-y-3">
                      {result.destinations!.map((d, i) => (
                        <li
                          key={`${d.name}-${i}`}
                          className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] px-3.5 py-3"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-sm font-bold text-[var(--color-primary)]">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold text-[var(--color-text)]">{d.city}</p>
                            <p className="mt-0.5 text-sm leading-snug text-[var(--color-text-muted)]">
                              {d.name}
                              {d.state ? ` · ${d.state}` : ''}
                            </p>
                          </div>
                          <MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--color-primary)] opacity-70" />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-[var(--color-text-muted)]">
          <Link to="/login" className="inline-block py-2 text-[var(--color-primary)]">
            Entrar no sistema
          </Link>
        </p>
      </div>
    </div>
  )
}
