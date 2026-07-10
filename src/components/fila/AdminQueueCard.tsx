"use client";

import { memo } from "react";
import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import {
  formatVencimentoLabel,
  daysUntilVencimento,
  isNfVencida,
} from "@/lib/minuta-intelligence";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatPrevisaoDate } from "@/lib/utils";
import { Bike, Calendar, PackageOpen } from "lucide-react";

function getCarretaPlaca(entry: QueueEntry): string {
  return entry.placa_carreta?.trim() || entry.placa?.trim() || "—";
}

type AdminQueueCardProps = {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  isNext?: boolean;
  onClick: () => void;
};

function CardMetaPill({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "urgent" | "brand";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "admin-queue-card__pill",
        tone === "urgent" && "admin-queue-card__pill--urgent",
        tone === "brand" && "admin-queue-card__pill--brand"
      )}
    >
      {children}
    </span>
  );
}

/** Card da fila admin — dados operacionais visíveis de primeira */
export const AdminQueueCard = memo(function AdminQueueCard({
  entry,
  position,
  selected = false,
  isNext = false,
  onClick,
}: AdminQueueCardProps) {
  const active = isActiveQueueStatus(entry.status);
  const previsao = entry.previsao_descarregamento?.trim();
  const racks = entryRetornoRacksVazios(entry);
  const volume = entry.volume_motos != null && entry.volume_motos > 0 ? entry.volume_motos : null;
  const volumeEstimado = Boolean(entry.volume_estimado);
  const nfLabel = formatVencimentoLabel(entry.menor_vencimento);
  const nfDays = daysUntilVencimento(entry.menor_vencimento);
  const nfUrgente =
    active &&
    (isNfVencida(entry.menor_vencimento) ||
      (nfDays != null && nfDays >= 0 && nfDays <= 1));
  const hasMeta =
    volume != null || Boolean(nfLabel) || racks || Boolean(previsao) || volumeEstimado;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "admin-queue-card group w-full text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        selected && "admin-queue-card--selected",
        isNext && active && "admin-queue-card--next",
        nfUrgente && !selected && "admin-queue-card--nf-urgent"
      )}
    >
      <span className="admin-queue-card__position tabular-nums">{position}</span>

      <div className="admin-queue-card__body min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-brand">
              {entry.minuta || "—"}
            </p>
            <p className="mt-0.5 font-mono text-sm text-slate-600">{getCarretaPlaca(entry)}</p>
          </div>
          <StatusBadge status={entry.status} compact className="shrink-0" />
        </div>

        <p className="mt-2 truncate text-sm text-slate-800">{entry.nome?.trim() || "—"}</p>
        <p className="truncate text-sm text-slate-500">{entry.transportadora?.trim() || "—"}</p>

        {hasMeta && (
          <div className="admin-queue-card__meta mt-2.5 flex flex-wrap items-center gap-1.5">
            {volumeEstimado && (
              <CardMetaPill
                tone="urgent"
                title="Minuta sem importação da ConsultaGeral — volume médio 62 no estoque"
              >
                Sem importação
              </CardMetaPill>
            )}
            {volume != null && (
              <CardMetaPill
                title={
                  volumeEstimado
                    ? `${volume} motos (média estimada)`
                    : `${volume} motos`
                }
              >
                <Bike className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                {volume}
                {volumeEstimado ? " · média" : ""}
              </CardMetaPill>
            )}
            {nfLabel && (
              <CardMetaPill
                tone={nfUrgente ? "urgent" : "neutral"}
                title={
                  isNfVencida(entry.menor_vencimento)
                    ? "NF vencida"
                    : nfUrgente
                      ? "NF vence em breve"
                      : nfLabel
                }
              >
                {nfLabel}
              </CardMetaPill>
            )}
            {racks && (
              <CardMetaPill title="Retorna com racks vazios">
                <PackageOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                Racks
              </CardMetaPill>
            )}
            {previsao && (
              <CardMetaPill tone="brand" title="Previsão de descarregamento">
                <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                {formatPrevisaoDate(previsao)}
                {entry.previsao_automatica && active && (
                  <span className="opacity-70"> · auto</span>
                )}
              </CardMetaPill>
            )}
          </div>
        )}
      </div>
    </button>
  );
});
