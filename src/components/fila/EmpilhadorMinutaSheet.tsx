"use client";

import type { QueueEntry, QueueStatus } from "@/lib/types";
import { isAusenteQueueStatus, isActiveQueueStatus } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { isNfVencida } from "@/lib/minuta-intelligence";
import { formatPhone } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  MessageCircle,
  Phone,
  RotateCcw,
  User,
  UserX,
  X,
} from "lucide-react";

type EmpilhadorMinutaSheetProps = {
  entry: QueueEntry;
  saving: boolean;
  canChamarWhatsApp: boolean;
  onClose: () => void;
  onChamarMotorista: (entry: QueueEntry) => void;
  onApplyStatus: (entryId: string, status: QueueStatus, fromStatus?: string) => void;
};

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

/** Painel inferior ao tocar na minuta — ações operacionais sem repetir o card */
export function EmpilhadorMinutaSheet({
  entry,
  saving,
  canChamarWhatsApp,
  onClose,
  onChamarMotorista,
  onApplyStatus,
}: EmpilhadorMinutaSheetProps) {
  const active = isActiveQueueStatus(entry.status);
  const absent = isAusenteQueueStatus(entry.status);
  const priority = entryHasPrioridade(entry);
  const placa = entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
  const telefone = formatPhone(entry.telefone);

  return (
    <div className="space-y-5 pb-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Minuta
          </p>
          <p className="truncate text-2xl font-bold tracking-tight text-brand">
            {entry.minuta || "—"}
          </p>
          <p className="mt-0.5 font-mono text-sm font-medium text-slate-600">{placa}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={entry.status} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-slate-50/50 px-3">
        <FactRow label="Motorista" value={entry.nome?.trim() || "—"} />
        <FactRow label="Transportadora" value={entry.transportadora?.trim() || "—"} />
        {telefone && (
          <FactRow
            label="Telefone"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {telefone}
              </span>
            }
          />
        )}
        {entry.doca?.trim() && <FactRow label="Doca" value={entry.doca.trim()} />}
      </dl>

      {active &&
        isNfVencida(entry.menor_vencimento) &&
        !priority && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
            NF vencida — sem prioridade automática. Avise o administrador se precisar de prioridade
            manual.
          </p>
        )}

      <div className="space-y-2 pt-1">
        {active && canChamarWhatsApp && (
          <Button
            variant="success"
            size="lg"
            className="w-full rounded-xl"
            disabled={saving}
            onClick={() => onChamarMotorista(entry)}
          >
            <MessageCircle className="h-5 w-5" />
            Chamar motorista
          </Button>
        )}

        {active && (
          <>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-center rounded-xl"
              disabled={saving}
              onClick={() => onApplyStatus(entry.id, "ausente")}
            >
              <UserX className="h-4 w-4" />
              Motorista ausente
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-center rounded-xl"
              disabled={saving}
              onClick={() => onApplyStatus(entry.id, "finalizado")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar operação
            </Button>
          </>
        )}

        {!active && (
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-center rounded-xl border-brand text-brand"
            disabled={saving}
            onClick={() =>
              onApplyStatus(entry.id, "aguardando_descarregamento", entry.status)
            }
          >
            <RotateCcw className="h-4 w-4" />
            {absent ? "Motorista voltou" : "Reativar na fila"}
          </Button>
        )}
      </div>

      {absent && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <User className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Ausente permanece no topo até retornar ou ser encerrado.
        </p>
      )}
    </div>
  );
}
