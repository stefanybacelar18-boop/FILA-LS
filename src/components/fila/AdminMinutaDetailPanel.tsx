"use client";

import type { QueueEntry, QueueStatus } from "@/lib/types";
import type { QueuePermissions } from "@/lib/role-permissions";
import { isAusenteQueueStatus, isDriverCalled } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { isNfVencida } from "@/lib/minuta-intelligence";
import { formatPhone, formatPrevisaoDate, cn } from "@/lib/utils";
import { CheckinEntrySummary } from "@/components/fila/CheckinEntrySummary";
import { MinutaMetaBadge } from "@/components/fila/MinutaMetaBadge";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { QueueEntryDates } from "@/components/fila/QueueEntryDates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  AlertCircle,
  ClipboardList,
  MessageCircle,
  PackageOpen,
  PhoneCall,
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

function OpsChip({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "priority";
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "brand" && "bg-brand-muted text-brand-dark",
        tone === "priority" && "bg-amber-100 text-amber-900"
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function PanelBlock({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

/** Painel desktop admin — visão completa da minuta selecionada */
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
      <div className="flex min-h-[20rem] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted text-brand">
          <ClipboardList className="h-7 w-7" aria-hidden />
        </div>
        <p className="text-base font-semibold text-slate-800">Nenhuma minuta selecionada</p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          Clique em um veículo na fila para ver o check-in completo e gerenciar status, doca e
          prioridade.
        </p>
      </div>
    );
  }

  const priority = entryHasPrioridade(selected);
  const racks = entryRetornoRacksVazios(selected);
  const called = selectedIsActive && isDriverCalled(selected);
  const absent = isAusenteQueueStatus(selected.status);
  const carreta = getCarretaPlaca(selected);
  const cavalo = selected.placa_cavalo?.trim();
  const showCavalo = Boolean(cavalo && cavalo !== carreta && carreta !== "—");

  return (
    <div className="space-y-5">
      <header className="space-y-3 border-b border-slate-100 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Minuta
            </p>
            <p className="truncate text-2xl font-bold tracking-tight text-brand">
              {selected.minuta || "—"}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-700">{carreta}</p>
            {showCavalo && (
              <p className="mt-0.5 font-mono text-xs text-slate-500">Cavalo {cavalo}</p>
            )}
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{selected.nome || "—"}</span>
              <span className="text-slate-400"> · </span>
              {selected.transportadora || "—"}
            </p>
            <p className="text-xs text-slate-400">{formatPhone(selected.telefone)}</p>
          </div>
          <StatusBadge status={selected.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MinutaMetaBadge
            volumeMotos={selected.volume_motos}
            menorVencimento={selected.menor_vencimento}
            staffView
          />
          {selectedIsActive && (
            <PrevisaoDisplay
              previsao={selected.previsao_descarregamento}
              automatic={selected.previsao_automatica}
            />
          )}
        </div>

        {(priority || called || racks) && selectedIsActive && (
          <div className="flex flex-wrap gap-1.5">
            {priority && (
              <OpsChip tone="priority" icon={<Star className="h-3 w-3" aria-hidden />}>
                {selected.prioridade_automatica ? "Prioridade NF" : "Prioridade"}
              </OpsChip>
            )}
            {called && (
              <OpsChip tone="brand" icon={<PhoneCall className="h-3 w-3" aria-hidden />}>
                Chamado
              </OpsChip>
            )}
            {racks && (
              <OpsChip tone="neutral" icon={<PackageOpen className="h-3 w-3" aria-hidden />}>
                Retorna racks
              </OpsChip>
            )}
          </div>
        )}

        {selected.capacidade_aviso && selectedIsActive && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {selected.capacidade_aviso}
              {selected.previsao_automatica && selected.previsao_descarregamento && (
                <>
                  {" "}
                  · Previsão automática para{" "}
                  {formatPrevisaoDate(selected.previsao_descarregamento)}
                </>
              )}
            </span>
          </p>
        )}

        {selectedIsActive &&
          isNfVencida(selected.menor_vencimento) &&
          !priority && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
              NF vencida — não entra em prioridade automática. Defina prioridade manual se
              necessário.
            </p>
          )}
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <PanelBlock title="Cronologia">
            <QueueEntryDates entry={selected} compact />
          </PanelBlock>

          <PanelBlock title="Dados do check-in">
            <CheckinEntrySummary entry={selected} mode="full" dense />
          </PanelBlock>
        </div>

        <div className="space-y-5">
          <PanelBlock title="Gestão operacional">
            <div className="space-y-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
              {permissions.canSetPrioridade && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/80 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={editPrioridade}
                    disabled={saving}
                    onChange={(e) => onSavePrioridade(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                  />
                  <span className="min-w-0 leading-snug">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Star className="h-4 w-4 text-amber-600" aria-hidden />
                      Prioridade na fila
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {selected.prioridade_automatica
                        ? editPrioridade
                          ? "Prioridade automática (NF vence amanhã)"
                          : "Prioridade automática dispensada — ordem de check-in"
                        : "Prioridade manual definida pelo administrador"}
                    </span>
                  </span>
                </label>
              )}

              {permissions.canSetPrioridade && selected.prioridade_automatica_dispensada && (
                <p className="text-xs text-amber-800">
                  NF ainda vence amanhã, mas sem prioridade na fila. Marque de novo para reativar.
                </p>
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
                        ? "Previsão automática (capacidade)"
                        : "Previsão de descarregamento"
                    }
                    type="date"
                    value={editPrevisao}
                    onChange={(e) => onEditPrevisao(e.target.value)}
                  />
                  {selected.previsao_automatica && (
                    <p className="mt-1 text-xs text-sky-700">
                      Calculada pelo volume da minuta e capacidade de expedição. Altere a data para
                      definir manualmente.
                    </p>
                  )}
                </div>
              )}

              {permissions.canEditRetornoRacks && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-teal-200/80 bg-teal-50/80 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={editRetornoRacks}
                    disabled={saving}
                    onChange={(e) => onEditRetornoRacks(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <PackageOpen className="h-4 w-4 text-teal-700" aria-hidden />
                  <span className="font-medium text-slate-800">Retorna com racks vazios</span>
                </label>
              )}
            </div>
          </PanelBlock>

          <PanelBlock title="Ações">
            <div className="space-y-2">
              {permissions.canChamarWhatsApp && selectedIsActive && (
                <Button
                  variant="success"
                  size="lg"
                  className="w-full justify-center rounded-xl"
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
                  className="w-full justify-center rounded-xl border-brand text-brand"
                  disabled={saving}
                  onClick={() =>
                    onApplyStatus(selected.id, "aguardando_descarregamento", selected.status)
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  {absent ? "Motorista voltou — liberar descarregamento" : "Reativar na fila"}
                </Button>
              )}

              <Button
                className="w-full justify-center rounded-xl"
                size="lg"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? <Spinner size="sm" /> : "Salvar alterações"}
              </Button>

              <p className="rounded-xl bg-brand-muted/60 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                Altere status, doca, prioridade, previsão e retorno com racks. As mudanças são
                refletidas na fila em tempo real.
              </p>
            </div>
          </PanelBlock>
        </div>
      </div>
    </div>
  );
}
