import { cn } from "@/lib/utils";

type QueueAdminSummaryStripProps = {
  waiting: number;
  called: number;
  total: number;
  className?: string;
};

/** Resumo horizontal compacto — admin fila (harmonizado com empilhador) */
export function QueueAdminSummaryStrip({
  waiting,
  called,
  total,
  className,
}: QueueAdminSummaryStripProps) {
  return (
    <div
      className={cn("stat-strip", className)}
      role="status"
      aria-label={`${waiting} aguardando chamada, ${called} chamados, ${total} exibindo na fila`}
    >
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-amber-700">{waiting}</span>
        <span className="stat-strip__label">Aguardando</span>
        <span className="stat-strip__hint">Sem chamada</span>
      </div>
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-emerald-700">{called}</span>
        <span className="stat-strip__label">Chamados</span>
        <span className="stat-strip__hint">WhatsApp enviado</span>
      </div>
      <div className="stat-strip__cell">
        <span className="stat-strip__value text-brand">{total}</span>
        <span className="stat-strip__label">Exibindo</span>
        <span className="stat-strip__hint">Na lista</span>
      </div>
    </div>
  );
}
