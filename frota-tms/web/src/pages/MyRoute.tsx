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

/** Ativa shell mobile (sem scroll lateral) nas páginas públicas. */
function usePublicMobileShell() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('public-mobile')
    return () => root.classList.remove('public-mobile')
  }, [])
}

/**
 * Meu roteiro — padrão visual FrotaTMS/Login.
 * No celular: viewport travado (sem deslocar para os lados), como app.
 */
export function MyRoute() {
  usePublicMobileShell()
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
    <div className="fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
          aria-label="Tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="flex flex-1 flex-col pt-10 sm:justify-center sm:pt-0">
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
              className="h-11 max-w-full text-base"
            />
            <Input
              label="Senha"
              type="password"
              inputMode="text"
              autoComplete="current-password"
              enterKeyHint="go"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              className="h-11 max-w-full text-base"
            />
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <Button type="submit" className="h-11 w-full" loading={loading}>
              Ver roteiro de amanhã
            </Button>
          </form>

          {result && (
            <div
              ref={resultRef}
              className="mt-6 min-w-0 scroll-mt-4 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              {!result.found ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {result.message || 'Nenhum roteiro para amanhã nesta placa.'}
                </p>
              ) : (
                <div className="min-w-0 space-y-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                      Roteiro
                    </p>
                    <p className="mt-1 break-words text-lg font-semibold text-[var(--color-text)]">
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
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--color-text-muted)]">Data</p>
                      <p className="break-words font-medium">
                        {formatDate(result.routeDate)} · {result.departureAt}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--color-text-muted)]">Retorno previsto</p>
                      <p className="break-words font-medium">
                        {result.expectedReturnAt ? formatDate(result.expectedReturnAt) : '—'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--color-text-muted)]">Placa</p>
                      <p className="font-medium">{result.plate}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--color-text-muted)]">Motorista</p>
                      <p className="break-words font-medium">{result.driverName || '—'}</p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                      Destinos
                    </p>
                    {(result.destinations?.length ?? 0) === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">Sem destinos</p>
                    ) : (
                      <ul className="space-y-2">
                        {result.destinations!.map((d, i) => (
                          <li
                            key={`${d.name}-${i}`}
                            className="flex min-w-0 items-start gap-2.5 text-sm text-[var(--color-text)]"
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-muted)] text-xs font-semibold text-[var(--color-primary)]">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="break-words font-medium">{d.city}</p>
                              <p className="break-words text-[var(--color-text-muted)]">
                                {d.name}
                                {d.state ? ` · ${d.state}` : ''}
                              </p>
                            </div>
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)] opacity-70" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="mt-auto pt-8 text-center text-sm text-[var(--color-text-muted)] sm:mt-6 sm:pt-0">
            <Link to="/login" className="text-[var(--color-primary)] hover:underline">
              Entrar no sistema
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
