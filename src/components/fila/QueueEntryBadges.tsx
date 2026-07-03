import type { QueueEntry } from "@/lib/types";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { MinutaMetaBadge } from "@/components/fila/MinutaMetaBadge";
import { PrevisaoDisplay } from "@/components/fila/PrevisaoDisplay";
import { RacksVaziosBadge } from "@/components/fila/RacksVaziosBadge";
import { cn } from "@/lib/utils";

type QueueEntryBadgesProps = {
  entry: QueueEntry & { previsao_automatica?: boolean };
  compact?: boolean;
  className?: string;
  showRacks?: boolean;
  layout?: "stack" | "inline";
};

/** Volume, vencimento NF, previsão e racks — stack compartilhado da fila. */
export function QueueEntryBadges({
  entry,
  compact = false,
  className,
  showRacks = true,
  layout = "stack",
}: QueueEntryBadgesProps) {
  const hasMeta = entry.volume_motos != null || entry.menor_vencimento;
  const hasPrevisao = Boolean(entry.previsao_descarregamento);
  const hasRacks = showRacks && entryRetornoRacksVazios(entry);

  if (!hasMeta && !hasPrevisao && !hasRacks) return null;

  return (
    <div
      className={cn(
        layout === "inline" ? "flex flex-wrap items-center gap-1.5" : "flex flex-col gap-1",
        className
      )}
    >
      <MinutaMetaBadge
        compact={compact}
        volumeMotos={entry.volume_motos}
        menorVencimento={entry.menor_vencimento}
      />
      <PrevisaoDisplay
        previsao={entry.previsao_descarregamento}
        automatic={entry.previsao_automatica}
        compact={compact}
      />
      {hasRacks && (
        <RacksVaziosBadge className={compact ? "scale-90 self-start" : undefined} />
      )}
    </div>
  );
}
