import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Moon, Sun, ClipboardCheck, CheckCircle2, MapPin } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { Button, Input } from '../components/ui'
import { SignaturePad } from '../components/logbook/SignaturePad'
import { ChecklistForm } from '../components/logbook/ChecklistForm'
import { ReportStopsForm } from '../components/logbook/ReportStopsForm'
import { formatDateTime } from '../lib/format'
import type { ChecklistState, FuelLevel, LogbookReportExtras, LogbookSession, LogbookStopEntry } from '../types/logbook'
import { cn } from '../lib/cn'

const PLATE_KEY = 'frotatms-diario-placa'
const MAT_KEY = 'frotatms-diario-matricula'

function emptyChecklist(items: LogbookSession['checklistItems']): ChecklistState {
  return Object.fromEntries(items.map((i) => [i.id, {}]))
}

function usePublicMobileShell() {
  useEffect(() => {
    document.documentElement.classList.add('public-mobile')
    return () => document.documentElement.classList.remove('public-mobile')
  }, [])
}

function FuelPicker({
  label,
  levels,
  value,
  onChange,
}: {
  label: string
  levels: FuelLevel[]
  value: string
  onChange: (v: FuelLevel) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold',
              value === l
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

export function LogbookDriver() {
  usePublicMobileShell()
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const [plate, setPlate] = useState(() => localStorage.getItem(PLATE_KEY) ?? '')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<LogbookSession | null>(null)
  const [step, setStep] = useState<'saída' | 'paradas' | 'retorno'>('saída')

  const [matricula, setMatricula] = useState(() => localStorage.getItem(MAT_KEY) ?? '')
  const [helperName, setHelperName] = useState('')
  const [helperMat, setHelperMat] = useState('')
  const [kmInitial, setKmInitial] = useState('')
  const [kmFinal, setKmFinal] = useState('')
  const [dieselDep, setDieselDep] = useState('')
  const [oilDep, setOilDep] = useState('')
  const [dieselRet, setDieselRet] = useState('')
  const [oilRet, setOilRet] = useState('')
  const [checkDep, setCheckDep] = useState<ChecklistState>({})
  const [checkRet, setCheckRet] = useState<ChecklistState>({})
  const [damage, setDamage] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const [sigDep, setSigDep] = useState<string | null>(null)
  const [sigRet, setSigRet] = useState<string | null>(null)
  const [stops, setStops] = useState<LogbookStopEntry[]>([])
  const [reportExtras, setReportExtras] = useState<LogbookReportExtras>({
    pernoites: [{}, {}, {}],
    meals: [{}, {}, {}],
    restTimes: [{}, {}, {}],
    waitTimes: [{}, {}, {}],
    maintenance: {},
  })
  const [tripObservations, setTripObservations] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  async function openSession(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/public/diario-bordo/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: plate.trim().toUpperCase(), pin }),
      })
      const data = (await res.json()) as LogbookSession & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Falha ao abrir diário.')
      setSession(data)
      localStorage.setItem(PLATE_KEY, plate.trim().toUpperCase())
      setCheckDep(data.logbook.checklistDeparture ?? emptyChecklist(data.checklistItems))
      setCheckRet(data.logbook.checklistReturn ?? emptyChecklist(data.checklistItems))
      if (data.logbook.kmInitial != null) setKmInitial(String(data.logbook.kmInitial))
      else if (data.suggestedKmInitial != null) setKmInitial(String(data.suggestedKmInitial))
      if (data.logbook.kmFinal != null) setKmFinal(String(data.logbook.kmFinal))
      if (data.logbook.driverMatricula) setMatricula(data.logbook.driverMatricula)
      if (data.logbook.helperName) setHelperName(data.logbook.helperName)
      if (data.logbook.helperMatricula) setHelperMat(data.logbook.helperMatricula)
      if (data.logbook.fuelDieselDeparture) setDieselDep(data.logbook.fuelDieselDeparture)
      if (data.logbook.fuelOilDeparture) setOilDep(data.logbook.fuelOilDeparture)
      if (data.logbook.fuelDieselReturn) setDieselRet(data.logbook.fuelDieselReturn)
      if (data.logbook.fuelOilReturn) setOilRet(data.logbook.fuelOilReturn)
      if (data.logbook.damageDescription) setDamage(data.logbook.damageDescription)
      if (data.logbook.maintenanceDescription) setMaintenance(data.logbook.maintenanceDescription)
      if (data.logbook.stops?.length) setStops(data.logbook.stops)
      if (data.logbook.reportExtras) setReportExtras(data.logbook.reportExtras)
      if (data.logbook.tripObservations) setTripObservations(data.logbook.tripObservations)
      setStep(
        data.logbook.returnComplete ? 'retorno' : data.logbook.departureComplete ? 'paradas' : 'saída',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar.')
    } finally {
      setLoading(false)
    }
  }

  async function submitDeparture() {
    if (!session) return
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      localStorage.setItem(MAT_KEY, matricula)
      const res = await fetch('/api/public/diario-bordo/departure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: plate.trim().toUpperCase(),
          pin,
          driverMatricula: matricula,
          helperName,
          helperMatricula: helperMat,
          kmInitial: Number(kmInitial),
          fuelDieselDeparture: dieselDep || undefined,
          fuelOilDeparture: oilDep || undefined,
          checklistDeparture: checkDep,
          signaturePng: sigDep,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar saída.')
      setSession((s) => (s ? { ...s, logbook: { ...s.logbook, ...data.logbook } } : s))
      setSuccess('Checklist de saída assinado e salvo.')
      setStep('paradas')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReport() {
    if (!session) return
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/diario-bordo/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: plate.trim().toUpperCase(),
          pin,
          stops,
          reportExtras,
          tripObservations,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar paradas.')
      setSession((s) => (s ? { ...s, logbook: { ...s.logbook, ...data.logbook } } : s))
      setSuccess('Paradas salvas. Agora complete o checklist de retorno.')
      setStep('retorno')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReturn() {
    if (!session) return
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/diario-bordo/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: plate.trim().toUpperCase(),
          pin,
          kmFinal: Number(kmFinal),
          fuelDieselReturn: dieselRet || undefined,
          fuelOilReturn: oilRet || undefined,
          checklistReturn: checkRet,
          damageDescription: damage,
          maintenanceDescription: maintenance,
          signaturePng: sigRet,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar retorno.')
      setSession((s) => (s ? { ...s, logbook: { ...s.logbook, ...data.logbook } } : s))
      setSuccess(
        'Diário concluído e enviado para o coordenador conferir e assinar. Não é necessário entregar papel.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-xl font-bold">
              Diário de <span className="text-teal-500">bordo</span>
            </h1>
            <button type="button" onClick={toggleTheme} className="rounded-md p-2">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          <p className="mb-6 text-sm text-[var(--color-text-muted)]">
            Checklist digital LSL com assinatura. Use a mesma senha do Meu Roteiro.
          </p>
          <form onSubmit={openSession} className="space-y-3">
            <Input label="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} required />
            <Input
              label="Senha"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Abrir diário
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link to="/meu-roteiro" className="text-[var(--color-primary)] hover:underline">
              Meu roteiro
            </Link>
            {' · '}
            <Link to="/login" className="text-[var(--color-primary)] hover:underline">
              Admin
            </Link>
          </p>
        </div>
      </div>
    )
  }

  const { prefilled, logbook, checklistItems, fuelLevels } = session
  const depLocked = logbook.departureComplete
  const retLocked = logbook.returnComplete

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-24">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">{prefilled.company}</p>
            <p className="font-display font-semibold">{prefilled.plate}</p>
          </div>
          <button type="button" onClick={() => setSession(null)} className="text-xs text-[var(--color-primary)]">
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <p>
            <span className="text-[var(--color-text-muted)]">Motorista:</span>{' '}
            {prefilled.driverName ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Roteiro:</span> {prefilled.routeName ?? '—'}
          </p>
          <p>
            <span className="text-[var(--color-text-muted)]">Saída:</span>{' '}
            {formatDateTime(prefilled.departureAt)}
          </p>
        </div>

        <div className="flex gap-1">
          {(['saída', 'paradas', 'retorno'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium capitalize sm:text-sm',
                step === s
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              )}
            >
              {s === 'saída' && depLocked && <CheckCircle2 className="h-4 w-4" />}
              {s === 'paradas' && session.logbook.reportStopsComplete && <CheckCircle2 className="h-4 w-4" />}
              {s === 'retorno' && retLocked && <CheckCircle2 className="h-4 w-4" />}
              {s === 'paradas' ? 'Paradas' : s}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            {success}
          </p>
        )}

        {step === 'saída' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-5 w-5" /> Checklist de saída
            </h2>
            <Input
              label="Matrícula"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              disabled={depLocked}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Ajudante"
                value={helperName}
                onChange={(e) => setHelperName(e.target.value)}
                disabled={depLocked}
              />
              <Input
                label="Mat. ajudante"
                value={helperMat}
                onChange={(e) => setHelperMat(e.target.value)}
                disabled={depLocked}
              />
            </div>
            <Input
              label="KM inicial"
              type="number"
              value={kmInitial}
              onChange={(e) => setKmInitial(e.target.value)}
              disabled={depLocked}
              required
            />
            <FuelPicker
              label="Diesel (saída)"
              levels={fuelLevels}
              value={dieselDep}
              onChange={setDieselDep}
            />
            <FuelPicker
              label="Óleo motor (saída)"
              levels={fuelLevels}
              value={oilDep}
              onChange={setOilDep}
            />
            <ChecklistForm
              items={checklistItems}
              value={checkDep}
              onChange={setCheckDep}
              disabled={depLocked}
            />
            {!depLocked && (
              <>
                <SignaturePad label="Assinatura — motorista (saída)" onChange={setSigDep} />
                <Button
                  className="w-full"
                  loading={submitting}
                  onClick={() => void submitDeparture()}
                  disabled={!sigDep || !kmInitial}
                >
                  Assinar e concluir saída
                </Button>
              </>
            )}
            {depLocked && (
              <p className="text-center text-sm text-[var(--color-text-muted)]">
                Saída assinada em {formatDateTime(logbook.departureSignedAt ?? undefined)}
              </p>
            )}
          </div>
        )}

        {step === 'paradas' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <MapPin className="h-5 w-5" /> Relatório de paradas
            </h2>
            {!depLocked && (
              <p className="text-sm text-amber-600">Complete o checklist de saída primeiro.</p>
            )}
            <ReportStopsForm
              stops={stops}
              extras={reportExtras}
              observations={tripObservations}
              disabled={!depLocked || retLocked}
              onStopsChange={setStops}
              onExtrasChange={setReportExtras}
              onObservationsChange={setTripObservations}
            />
            {depLocked && !retLocked && (
              <Button className="w-full" loading={submitting} onClick={() => void submitReport()}>
                Salvar paradas e continuar
              </Button>
            )}
            {session.logbook.reportStopsComplete && !retLocked && (
              <p className="text-center text-sm text-[var(--color-text-muted)]">
                Paradas registradas. Complete o retorno quando finalizar a viagem.
              </p>
            )}
          </div>
        )}

        {step === 'retorno' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-5 w-5" /> Checklist de retorno
            </h2>
            {!depLocked && (
              <p className="text-sm text-amber-600">Complete o checklist de saída primeiro.</p>
            )}
            {depLocked && !logbook.reportStopsComplete && (
              <p className="text-sm text-amber-600">
                Registre as paradas (concessionárias e motos) antes de assinar o retorno.
              </p>
            )}
            <Input
              label="KM final"
              type="number"
              value={kmFinal}
              onChange={(e) => setKmFinal(e.target.value)}
              disabled={retLocked || !depLocked}
              required
            />
            <FuelPicker
              label="Diesel (retorno)"
              levels={fuelLevels}
              value={dieselRet}
              onChange={setDieselRet}
            />
            <FuelPicker
              label="Óleo motor (retorno)"
              levels={fuelLevels}
              value={oilRet}
              onChange={setOilRet}
            />
            <ChecklistForm
              items={checklistItems}
              value={checkRet}
              onChange={setCheckRet}
              disabled={retLocked || !depLocked}
            />
            <Input
              label="Local / descrição de avaria"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              disabled={retLocked || !depLocked}
            />
            <Input
              label="Descrição manutenção"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value)}
              disabled={retLocked || !depLocked}
            />
            {!retLocked && depLocked && session.logbook.reportStopsComplete && (
              <>
                <SignaturePad label="Assinatura — motorista (retorno)" onChange={setSigRet} />
                <Button
                  className="w-full"
                  loading={submitting}
                  onClick={() => void submitReturn()}
                  disabled={!sigRet || !kmFinal}
                >
                  Assinar retorno e enviar ao coordenador
                </Button>
              </>
            )}
            {retLocked && !logbook.coordinatorComplete && (
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-3 text-center text-sm">
                <p className="font-medium text-teal-900 dark:text-teal-100">Entregue ao coordenador</p>
                <p className="mt-1 text-[var(--color-text-muted)]">
                  Seu diário está na fila para conferência e assinatura. Retorno assinado em{' '}
                  {formatDateTime(logbook.returnSignedAt ?? undefined)}.
                </p>
              </div>
            )}
            {retLocked && logbook.coordinatorComplete && (
              <p className="text-center text-sm text-[var(--color-success)]">
                Diário conferido e arquivado pelo coordenador.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
