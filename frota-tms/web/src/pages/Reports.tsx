import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { downloadReport } from '../lib/api'
import { PageHeader, Button, Input, Select, Card } from '../components/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Vehicle } from '../types'

const reportTypes = [
  { type: 'frota', label: 'Frota completa' },
  { type: 'disponiveis', label: 'Veículos disponíveis' },
  { type: 'viagens', label: 'Viagens' },
  { type: 'diario', label: 'Diário de viagens' },
  { type: 'periodo', label: 'Viagens por período' },
  { type: 'concessionarias', label: 'Concessionárias' },
  { type: 'historico-placa', label: 'Histórico por placa' },
]

export function Reports() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => (await api.get<Vehicle[]>('/vehicles')).data,
  })

  async function download(format: 'excel' | 'pdf', type: string) {
    setError('')
    setLoading(`${format}-${type}`)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (vehicleId) params.set('vehicleId', vehicleId)
      const qs = params.toString()
      const path = `/reports/${format}/${type}${qs ? `?${qs}` : ''}`
      const ext = format === 'excel' ? 'xlsx' : 'pdf'
      await downloadReport(path, `relatorio-${type}.${ext}`)
    } catch {
      setError('Falha ao baixar o relatório. Verifique os filtros e tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Exportação em Excel e PDF para análise operacional"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select
          label="Veículo (histórico-placa)"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          options={vehicles.map((v) => ({ value: v.id, label: v.plate }))}
          placeholder="Selecione se necessário"
        />
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reportTypes.map((r) => (
          <Card key={r.type} title={r.label}>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={loading === `excel-${r.type}`}
                onClick={() => void download('excel', r.type)}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              {r.type !== 'historico-placa' && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={loading === `pdf-${r.type}`}
                  onClick={() => void download('pdf', r.type)}
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
              )}
              <span className="ml-auto inline-flex items-center text-xs text-[var(--color-text-muted)]">
                <Download className="mr-1 h-3.5 w-3.5" />
                Download
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
