"use client";

import type { QueueEntry, QueueStatus } from "@/lib/types";
import { isAusenteQueueStatus, isActiveQueueStatus } from "@/lib/queue";
import { CheckinEntrySummary } from "@/components/fila/CheckinEntrySummary";
import { Button } from "@/components/ui/Button";
import {
  CheckCircle2,
  MessageCircle,
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

/** Painel ao tocar na minuta — complemento ao card + ações operacionais */
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

  return (
    <div className="space-y-5 pb-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Detalhes do check-in</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <CheckinEntrySummary entry={entry} />

      <div className="space-y-2 border-t border-slate-100 pt-4">
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
