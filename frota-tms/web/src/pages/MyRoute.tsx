import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Lock, MapPin, Moon, Sun, Truck } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { Spinner } from '../components/ui'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

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

/** Página pública — formulário estilo app celular para motorista LSL. */
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
  const pinRef = useRef<HTMLInputElement>(null)

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
    <div className="flex min-h-[100dvh] flex-col bg-[var(--color-bg)]">
      {/* Topo app */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--color-primary)] uppercase">
              Frota LSL
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight text-[var(--color-text)]">
              Meu roteiro
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
            aria-label="Tema"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="mb-5 text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          Digite sua placa e a senha para ver o roteiro de <strong className="text-[var(--color-text)]">amanhã</strong>.
        </p>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col">
          <div className="space-y-3">
            {/* Campo placa — estilo app */}
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-muted)]">
                <Truck className="h-4 w-4 text-[var(--color-primary)]" />
                Placa do caminhão
              </span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                value={plate}
                onChange={(e) =>
                  setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    pinRef.current?.focus()
                  }
                }}
                placeholder="ABC1D23"
                required
                className={cn(
                  'h-16 w-full rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)]',
                  'px-4 text-center font-mono text-2xl font-bold tracking-[0.2em] text-[var(--color-text)]',
                  'outline-none transition placeholder:tracking-normal placeholder:text-[var(--color-text-muted)]/50',
                  'focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/15',
                )}
              />
            </label>

            {/* Campo senha — estilo app */}
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-muted)]">
                <Lock className="h-4 w-4 text-[var(--color-primary)]" />
                Senha
              </span>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9A-Za-z]*"
                autoComplete="current-password"
                enterKeyHint="go"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                required
                className={cn(
                  'h-16 w-full rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)]',
                  'px-4 text-center text-2xl font-bold tracking-[0.35em] text-[var(--color-text)]',
                  'outline-none transition placeholder:tracking-[0.35em] placeholder:text-[var(--color-text-muted)]/40',
                  'focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/15',
                )}
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-2xl bg-[var(--color-danger)]/10 px-4 py-3 text-center text-[15px] font-medium text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={loading || plate.length < 5 || pin.length < 4}
              className={cn(
                'flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold transition',
                'bg-[var(--color-primary)] text-[var(--color-primary-fg)]',
                'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
                'shadow-[0_8px_24px_-8px] shadow-[var(--color-primary)]/40',
              )}
            >
              {loading ? <Spinner size="sm" /> : null}
              Consultar roteiro
            </button>
            <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
              <Link to="/login" className="inline-block py-2">
                Sou da equipe · entrar
              </Link>
            </p>
          </div>
        </form>

        {result && (
          <div
            ref={resultRef}
            className="mt-6 scroll-mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
          >
            {!result.found ? (
              <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
                {result.message || 'Nenhum roteiro para amanhã nesta placa.'}
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--color-text-muted)] uppercase">
                    Roteiro
                  </p>
                  <p className="mt-1 text-xl font-bold leading-snug text-[var(--color-text)]">
                    {result.routeName}
                  </p>
                  {result.hasPriority && (
                    <p className="mt-2 inline-flex rounded-xl bg-[var(--color-danger)]/10 px-3 py-1.5 text-sm font-bold text-[var(--color-danger)]">
                      Prioridade
                      {result.priorityExpiryDate
                        ? ` · venc. ${formatDate(result.priorityExpiryDate)}`
                        : ''}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-3.5">
                    <p className="text-[11px] text-[var(--color-text-muted)]">Saída</p>
                    <p className="mt-1 text-base font-bold leading-snug">
                      {formatDate(result.routeDate)}
                      <br />
                      <span className="text-[var(--color-primary)]">{result.departureAt}</span>
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-3.5">
                    <p className="text-[11px] text-[var(--color-text-muted)]">Retorno</p>
                    <p className="mt-1 text-base font-bold leading-snug">
                      {result.expectedReturnAt ? formatDate(result.expectedReturnAt) : '—'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-3.5">
                    <p className="text-[11px] text-[var(--color-text-muted)]">Placa</p>
                    <p className="mt-1 font-mono text-base font-bold tracking-wide">{result.plate}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-surface-2)] px-3.5 py-3.5">
                    <p className="text-[11px] text-[var(--color-text-muted)]">Motorista</p>
                    <p className="mt-1 text-sm font-bold leading-snug">{result.driverName || '—'}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-text-muted)] uppercase">
                    Destinos ({result.destinations?.length ?? 0})
                  </p>
                  {(result.destinations?.length ?? 0) === 0 ? (
                    <p className="text-base text-[var(--color-text-muted)]">Sem destinos</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {result.destinations!.map((d, i) => (
                        <li
                          key={`${d.name}-${i}`}
                          className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3.5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-fg)]">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-bold text-[var(--color-text)]">{d.city}</p>
                            <p className="mt-0.5 text-sm leading-snug text-[var(--color-text-muted)]">
                              {d.name}
                              {d.state ? ` · ${d.state}` : ''}
                            </p>
                          </div>
                          <MapPin className="mt-1.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
