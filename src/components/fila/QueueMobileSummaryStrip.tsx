import { cn } from "@/lib/utils";

type QueueMobileSummaryStripProps = {
  waiting: number;
  finalized: number;
  className?: string;
};

/** Resumo horizontal compacto — empilhador mobile */
export function QueueMobileSummaryStrip({
  waiting,
  finalized,
  className,
}: QueueMobileSummaryStripProps) {
  return (
    <div
      className={cn("stat-strip", className)}
      role="status"
      aria-label={`${waiting} aguardando descarregamento na fila, ${finalized} finalizadas hoje`}
    >
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-brand">{waiting}</span>
        <span className="stat-strip__label">Aguardando</span>
        <span className="stat-strip__hint">Na fila agora</span>
      </div>
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-emerald-700">{finalized}</span>
        <span className="stat-strip__label">Finalizadas</span>
        <span className="stat-strip__hint">Hoje</span>
      </div>
    </div>
  );
}
