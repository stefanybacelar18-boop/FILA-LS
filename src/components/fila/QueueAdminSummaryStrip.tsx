import { cn } from "@/lib/utils";

type QueueAdminSummaryStripProps = {
  waiting: number;
  finalized: number;
  absent: number;
  className?: string;
};

/** Resumo horizontal compacto — admin fila (Aguardando · Finalizado · Ausente) */
export function QueueAdminSummaryStrip({
  waiting,
  finalized,
  absent,
  className,
}: QueueAdminSummaryStripProps) {
  return (
    <div
      className={cn("stat-strip", className)}
      role="status"
      aria-label={`${waiting} aguardando descarregamento, ${finalized} finalizados hoje, ${absent} ausentes`}
    >
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-amber-700">{waiting}</span>
        <span className="stat-strip__label">Aguardando</span>
        <span className="stat-strip__hint">Descarregamento</span>
      </div>
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-emerald-700">{finalized}</span>
        <span className="stat-strip__label">Finalizado</span>
        <span className="stat-strip__hint">Hoje</span>
      </div>
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-slate-600">{absent}</span>
        <span className="stat-strip__label">Ausente</span>
        <span className="stat-strip__hint">No pátio</span>
      </div>
    </div>
  );
}
