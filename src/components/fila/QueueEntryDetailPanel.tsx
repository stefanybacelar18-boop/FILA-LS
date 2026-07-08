"use client";

import type { QueueEntry, QueueStatus } from "@/lib/types";
import type { QueuePermissions } from "@/lib/role-permissions";
import { isAusenteQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { isNfVencida } from "@/lib/minuta-intelligence";
import { formatPhone, formatPrevisaoDate, cn } from "@/lib/utils";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import { QueueEntryDates } from "@/components/fila/QueueEntryDates";
import { RacksVaziosBadge } from "@/components/fila/RacksVaziosBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  MessageCircle,
  PackageOpen,
  RotateCcw,
  Star,
  UserX,
  X,
} from "lucide-react";

export type QueueEntryDetailPanelProps = {
  selected: QueueEntry | null;
  permissions: QueuePermissions;
  isAdmin: boolean;
  isEmpilhador: boolean;
  selectedIsActive: boolean;
  editPrioridade: boolean;
  editDoca: string;
  editStatus: QueueStatus;
  editPrevisao: string;
  editRetornoRacks: boolean;
  saving: boolean;
  statusOptions: { value: string; label: string }[];
  onClose?: () => void;
  onEditDoca: (value: string) => void;
  onEditStatus: (status: QueueStatus) => void;
  onEditPrevisao: (value: string) => void;
  onEditRetornoRacks: (value: boolean) => void;
  onSavePrioridade: (checked: boolean) => void;
  onChamarMotorista: (entry: QueueEntry) => void;
  onApplyStatus: (entryId: string, status: QueueStatus, fromStatus?: string) => void;
  onSave: () => void;
};

export function QueueEntryDetailPanel({
  selected,
  permissions,
  isAdmin,
  isEmpilhador,
  selectedIsActive,
  editPrioridade,
  editDoca,
  editStatus,
  editPrevisao,
  editRetornoRacks,
  saving,
  statusOptions,
  onClose,
  onEditDoca,
  onEditStatus,
  onEditPrevisao,
  onEditRetornoRacks,
  onSavePrioridade,
  onChamarMotorista,
  onApplyStatus,
  onSave,
}: QueueEntryDetailPanelProps) {
  if (!selected) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Filter className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-slate-600">Nenhuma minuta selecionada</p>
        <p className="mt-1 text-xs text-slate-400">
          Clique em um veículo na fila para editar status, doca e prioridade.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", isAdmin && "space-y-5")}>
      <section className={cn(isAdmin && "space-y-3")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-brand">{selected.minuta || "—"}</p>
            <p className="mt-1 font-mono text-base font-semibold text-slate-900">
              {selected.placa_cavalo || selected.placa}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {selected.nome || "—"}
              <span className="text-slate-400"> · </span>
              {selected.transportadora || "—"}
            </p>
            <p className="text-xs text-slate-400">{formatPhone(selected.telefone)}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {selected.capacidade_aviso && selectedIsActive && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                  <AlertCircle className="h-3 w-3" />
                  Capacidade
                </span>
              )}
              {entryHasPrioridade(selected) && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  <Star className="h-3 w-3" />
                  Prioridade
                </span>
              )}
              {entryRetornoRacksVazios(selected) && <RacksVaziosBadge />}
            </div>
            <QueueEntryBadges entry={selected} showRacks={false} className="mt-2" />
            {selected.capacidade_aviso && selectedIsActive && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
              !entryHasPrioridade(selected) && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  NF vencida — não entra em prioridade automática. Defina prioridade manual se
                  necessário.
                </p>
              )}
          </div>
          {isEmpilhador && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="border-t border-slate-100 pt-4">
          <QueueEntryDates entry={selected} />
        </section>
      )}

      <section className={cn("space-y-3", isAdmin && "border-t border-slate-100 pt-4")}>
        {permissions.canSetPrioridade && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm">
            <input
              type="checkbox"
              checked={editPrioridade}
              disabled={saving}
              onChange={(e) => onSavePrioridade(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <Star className="h-4 w-4 text-amber-600" />
            <span>
              {selected.prioridade_automatica
                ? editPrioridade
                  ? "Prioridade automática (NF vence amanhã)"
                  : "Prioridade automática dispensada — ordem de check-in"
                : "Prioridade manual na fila"}
            </span>
          </label>
        )}
        {permissions.canSetPrioridade && selected.prioridade_automatica_dispensada && (
          <p className="text-xs text-amber-800">
            NF ainda vence amanhã, mas sem prioridade na fila. Marque de novo para reativar.
          </p>
        )}

        {permissions.canEditDoca && (isAdmin || selectedIsActive) && (
          <Input
            label="Doca"
            value={editDoca}
            onChange={(e) => onEditDoca(e.target.value)}
            placeholder="Ex: Doca 3"
          />
        )}

        {permissions.canChamarWhatsApp && selectedIsActive && (
          <Button
            variant="success"
            className="w-full"
            size="lg"
            disabled={saving}
            onClick={() => onChamarMotorista(selected)}
          >
            <MessageCircle className="h-4 w-4" />
            Chamar motorista (WhatsApp)
          </Button>
        )}

        {isEmpilhador && selectedIsActive && (
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={saving}
              onClick={() => onApplyStatus(selected.id, "ausente")}
            >
              <UserX className="h-4 w-4" />
              Motorista ausente
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={saving}
              onClick={() => onApplyStatus(selected.id, "finalizado")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar operação
            </Button>
          </div>
        )}

        {!selectedIsActive && (isAdmin || isEmpilhador) && (
          <Button
            variant="outline"
            className="w-full justify-start border-brand text-brand"
            disabled={saving}
            onClick={() =>
              onApplyStatus(selected.id, "aguardando_descarregamento", selected.status)
            }
          >
            <RotateCcw className="h-4 w-4" />
            {isAusenteQueueStatus(selected.status)
              ? "Motorista voltou — liberar descarregamento"
              : "Reativar na fila"}
          </Button>
        )}

        {isAusenteQueueStatus(selected.status) && isEmpilhador && (
          <p className="text-xs leading-relaxed text-slate-500">
            Ausente permanece no topo da fila até ser descarregado. Os demais passam enquanto ele
            não retorna.
          </p>
        )}

        {isAdmin && statusOptions.length > 0 && (
          <Select
            label="Status"
            value={editStatus}
            onChange={(e) => onEditStatus(e.target.value as QueueStatus)}
            options={statusOptions}
          />
        )}

        {permissions.canEditPrevisao && isAdmin && (
          <div>
            <Input
              label={
                selected.previsao_automatica
                  ? "Previsão automática (capacidade)"
                  : "Previsão de descarregamento (data)"
              }
              type="date"
              value={editPrevisao}
              onChange={(e) => onEditPrevisao(e.target.value)}
            />
            {selected.previsao_automatica && (
              <p className="mt-1 text-xs text-sky-700">
                Calculada pelo volume da minuta e capacidade de expedição (aba Minutas). Altere a
                data para definir manualmente.
              </p>
            )}
          </div>
        )}

        {permissions.canEditRetornoRacks && isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-sm">
            <input
              type="checkbox"
              checked={editRetornoRacks}
              disabled={saving}
              onChange={(e) => onEditRetornoRacks(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <PackageOpen className="h-4 w-4 text-teal-700" />
            Retorna com racks
          </label>
        )}
      </section>

      {(isAdmin || (isEmpilhador && selectedIsActive)) && (
        <section className={cn("space-y-3", isAdmin && "border-t border-slate-100 pt-4")}>
          <Button className="w-full" size="lg" onClick={onSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : "Salvar alterações"}
          </Button>

          {isAdmin && (
            <p className="rounded-xl bg-brand-muted/80 p-3 text-xs leading-relaxed text-slate-600">
              Você pode alterar status, prioridade, previsão (data) e retorno com racks.
            </p>
          )}
        </section>
      )}

      {isEmpilhador && !selectedIsActive && (
        <p className="rounded-xl bg-brand-muted p-3 text-xs leading-relaxed text-slate-600">
          Esta minuta foi encerrada. Use &quot;Reativar na fila&quot; se precisar desfazer e voltar
          ao aguardando descarregamento.
        </p>
      )}

      {isEmpilhador && selectedIsActive && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
          Minutas com badge de prioridade e previsões de descarregamento são definidas pelo
          administrador.
        </p>
      )}
    </div>
  );
}
