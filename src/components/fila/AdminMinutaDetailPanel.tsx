"use client";

import { useState } from "react";
import type { QueueEntry, QueueStatus } from "@/lib/types";
import type { QueuePermissions } from "@/lib/role-permissions";
import { isAusenteQueueStatus, isDriverCalled, isActiveQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { isNfVencida, formatVencimentoLabel } from "@/lib/minuta-intelligence";
import { VEHICLE_TYPES, DEFAULT_CHECKIN_EMPRESA, DEFAULT_CHECKIN_TIPO_CARGA } from "@/lib/constants";
import {
  formatPhone,
  formatPrevisaoDate,
  formatQueueDay,
  formatQueueTime,
  cn,
} from "@/lib/utils";
import {
  formatEntryArrivalDay,
  formatEntryArrivalTime,
  formatEntryFinishedDay,
  formatEntryFinishedTime,
} from "@/lib/queue-entry-dates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  AlertCircle,
  ChevronDown,
  ClipboardList,
  MessageCircle,
  PackageOpen,
  RotateCcw,
  Star,
} from "lucide-react";

export type AdminMinutaDetailPanelProps = {
  selected: QueueEntry | null;
  permissions: QueuePermissions;
  selectedIsActive: boolean;
  editPrioridade: boolean;
  editDoca: string;
  editStatus: QueueStatus;
  editPrevisao: string;
  editRetornoRacks: boolean;
  saving: boolean;
  statusOptions: { value: string; label: string }[];
  onEditDoca: (value: string) => void;
  onEditStatus: (status: QueueStatus) => void;
  onEditPrevisao: (value: string) => void;
  onEditRetornoRacks: (value: boolean) => void;
  onSavePrioridade: (checked: boolean) => void;
  onChamarMotorista: (entry: QueueEntry) => void;
  onApplyStatus: (entryId: string, status: QueueStatus, fromStatus?: string) => void;
  onSave: () => void;
};

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

function vehicleTypeLabel(tipo: QueueEntry["tipo_veiculo"]): string | null {
  if (!tipo) return null;
  return VEHICLE_TYPES.find((v) => v.value === tipo)?.label ?? tipo;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="admin-detail-row">
      <dt className="admin-detail-row__label">{label}</dt>
      <dd className="admin-detail-row__value">{value}</dd>
    </div>
  );
}

function DetailRows({ children }: { children: React.ReactNode }) {
  return <dl className="admin-detail-rows">{children}</dl>;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="admin-detail-section">
      <button
        type="button"
        className="admin-detail-section__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open && <div className="admin-detail-section__body">{children}</div>}
    </section>
  );
}

/** Painel lateral admin — seções editoriais com hierarquia visual clara */
export function AdminMinutaDetailPanel({
  selected,
  permissions,
  selectedIsActive,
  editPrioridade,
  editDoca,
  editStatus,
  editPrevisao,
  editRetornoRacks,
  saving,
  statusOptions,
  onEditDoca,
  onEditStatus,
  onEditPrevisao,
  onEditRetornoRacks,
  onSavePrioridade,
  onChamarMotorista,
  onApplyStatus,
  onSave,
}: AdminMinutaDetailPanelProps) {
  if (!selected) {
    return (
      <div className="admin-detail-empty">
        <div className="admin-detail-empty__icon">
          <ClipboardList className="h-7 w-7" aria-hidden />
        </div>
        <p className="text-base font-medium text-slate-800">Nenhuma minuta selecionada</p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          Selecione um veículo na fila para ver detalhes e gerenciar a operação.
        </p>
      </div>
    );
  }

  const priority = entryHasPrioridade(selected);
  const racks = entryRetornoRacksVazios(selected);
  const called = selectedIsActive && isDriverCalled(selected);
  const absent = isAusenteQueueStatus(selected.status);
  const active = isActiveQueueStatus(selected.status);
  const carreta = getCarretaPlaca(selected);
  const cavalo = selected.placa_cavalo?.trim();
  const tipo = vehicleTypeLabel(selected.tipo_veiculo);
  const empresa = selected.empresa?.trim();
  const tipoCarga = selected.tipo_carga?.trim();
  const nfLabel = formatVencimentoLabel(selected.menor_vencimento);
  const obs = selected.observacoes?.trim();

  return (
    <div key={selected.id} className="admin-detail-panel animate-admin-fade-in space-y-4">
      <header className="admin-detail-header">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-semibold tracking-tight text-brand">
              {selected.minuta || "—"}
            </p>
            <p className="mt-1 font-mono text-sm text-slate-600">{carreta}</p>
            {cavalo && cavalo !== carreta && (
              <p className="mt-0.5 font-mono text-xs text-slate-400">Cavalo {cavalo}</p>
            )}
          </div>
          <StatusBadge status={selected.status} />
        </div>
      </header>

      {selected.capacidade_aviso && selectedIsActive && (
        <p className="admin-detail-alert admin-detail-alert--warn">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {selected.capacidade_aviso}
        </p>
      )}

      {selectedIsActive && isNfVencida(selected.menor_vencimento) && !priority && (
        <p className="admin-detail-alert admin-detail-alert--danger">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          NF vencida — sem prioridade automática. Defina prioridade manual se necessário.
        </p>
      )}

      <CollapsibleSection title="Dados principais" defaultOpen>
        <DetailRows>
          <DetailRow label="Motorista" value={selected.nome?.trim()} />
          <DetailRow label="Telefone" value={formatPhone(selected.telefone)} />
          <DetailRow label="Transportadora" value={selected.transportadora?.trim()} />
          <DetailRow label="Tipo de veículo" value={tipo} />
          <DetailRow
            label="Placa carreta"
            value={<span className="font-mono">{carreta}</span>}
          />
          {cavalo && (
            <DetailRow label="Placa cavalo" value={<span className="font-mono">{cavalo}</span>} />
          )}
          {selected.placa_segunda_carreta?.trim() && (
            <DetailRow
              label="Placa 2ª carreta"
              value={<span className="font-mono">{selected.placa_segunda_carreta.trim()}</span>}
            />
          )}
        </DetailRows>
      </CollapsibleSection>

      <CollapsibleSection title="Documentos">
        <DetailRows>
          {selected.volume_motos != null && selected.volume_motos > 0 && (
            <DetailRow label="Volume" value={`${selected.volume_motos} motos`} />
          )}
          {nfLabel && (
            <DetailRow
              label="Vencimento NF"
              value={
                <span className={isNfVencida(selected.menor_vencimento) ? "text-red-700" : undefined}>
                  {nfLabel}
                </span>
              }
            />
          )}
          {selected.previsao_descarregamento && (
            <DetailRow
              label="Previsão descarga"
              value={
                <>
                  {formatPrevisaoDate(selected.previsao_descarregamento)}
                  {selected.previsao_automatica && (
                    <span className="text-slate-400"> · automática</span>
                  )}
                </>
              }
            />
          )}
          {empresa && empresa !== DEFAULT_CHECKIN_EMPRESA && (
            <DetailRow label="Empresa" value={empresa} />
          )}
          {tipoCarga && tipoCarga !== DEFAULT_CHECKIN_TIPO_CARGA && (
            <DetailRow label="Tipo de carga" value={tipoCarga} />
          )}
          <DetailRow label="Retorno racks" value={racks ? "Sim" : "Não"} />
          {priority && (
            <DetailRow
              label="Prioridade"
              value={selected.prioridade_automatica ? "Automática (NF)" : "Manual"}
            />
          )}
          {called && <DetailRow label="Situação" value="Motorista chamado" />}
        </DetailRows>
      </CollapsibleSection>

      <CollapsibleSection title="Histórico">
        <DetailRows>
          <DetailRow
            label="Check-in"
            value={
              <>
                {formatEntryArrivalDay(selected)}
                <span className="text-slate-400"> · {formatEntryArrivalTime(selected)}</span>
              </>
            }
          />
          {selected.called_at && (
            <DetailRow
              label="Chamado em"
              value={
                <>
                  {formatQueueDay(selected.called_at)}
                  <span className="text-slate-400"> · {formatQueueTime(selected.called_at)}</span>
                </>
              }
            />
          )}
          <DetailRow
            label="Finalização"
            value={
              active ? (
                <span className="text-slate-500">Em andamento</span>
              ) : (
                <>
                  {formatEntryFinishedDay(selected)}
                  {formatEntryFinishedTime(selected) && (
                    <span className="text-slate-400">
                      {" "}
                      · {formatEntryFinishedTime(selected)}
                    </span>
                  )}
                </>
              )
            }
          />
        </DetailRows>
      </CollapsibleSection>

      {obs && (
        <CollapsibleSection title="Observações">
          <p className="text-sm leading-relaxed text-slate-700">{obs}</p>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Ações" defaultOpen>
        <div className="space-y-3">
          {permissions.canSetPrioridade && (
            <label className="admin-detail-check">
              <input
                type="checkbox"
                checked={editPrioridade}
                disabled={saving}
                onChange={(e) => onSavePrioridade(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <Star className="h-4 w-4 text-slate-500" aria-hidden />
                  Prioridade na fila
                </span>
                <span className="text-xs text-slate-500">
                  {selected.prioridade_automatica
                    ? editPrioridade
                      ? "Prioridade automática ativa"
                      : "Prioridade automática dispensada"
                    : "Prioridade manual"}
                </span>
              </span>
            </label>
          )}

          {permissions.canEditDoca && (
            <Input
              label="Doca"
              value={editDoca}
              onChange={(e) => onEditDoca(e.target.value)}
              placeholder="Ex: Doca 3"
            />
          )}

          {statusOptions.length > 0 && (
            <Select
              label="Status"
              value={editStatus}
              onChange={(e) => onEditStatus(e.target.value as QueueStatus)}
              options={statusOptions}
            />
          )}

          {permissions.canEditPrevisao && (
            <div>
              <Input
                label={
                  selected.previsao_automatica
                    ? "Previsão automática"
                    : "Previsão de descarregamento"
                }
                type="date"
                value={editPrevisao}
                onChange={(e) => onEditPrevisao(e.target.value)}
              />
              {selected.previsao_automatica && (
                <p className="mt-1 text-xs text-slate-500">
                  Altere a data para definir manualmente.
                </p>
              )}
            </div>
          )}

          {permissions.canEditRetornoRacks && (
            <label className="admin-detail-check">
              <input
                type="checkbox"
                checked={editRetornoRacks}
                disabled={saving}
                onChange={(e) => onEditRetornoRacks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <PackageOpen className="h-4 w-4 text-slate-500" aria-hidden />
                Retorna com racks vazios
              </span>
            </label>
          )}

          <div className="space-y-2 border-t border-slate-100 pt-3">
            {permissions.canChamarWhatsApp && selectedIsActive && (
              <Button
                variant="success"
                size="lg"
                className="w-full"
                disabled={saving}
                onClick={() => onChamarMotorista(selected)}
              >
                <MessageCircle className="h-5 w-5" />
                Chamar motorista (WhatsApp)
              </Button>
            )}

            {!selectedIsActive && (
              <Button
                variant="outline"
                size="lg"
                className="w-full border-brand text-brand"
                disabled={saving}
                onClick={() =>
                  onApplyStatus(selected.id, "aguardando_descarregamento", selected.status)
                }
              >
                <RotateCcw className="h-4 w-4" />
                {absent ? "Motorista voltou" : "Reativar na fila"}
              </Button>
            )}

            <Button className="w-full" size="lg" onClick={onSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
