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
      className={cn(
        "flex overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm",
        className
      )}
      role="status"
      aria-label={`${waiting} aguardando, ${finalized} finalizadas`}
    >
      <div className="flex flex-1 flex-col items-center border-r border-slate-100 px-3 py-2.5">
        <span className="text-xl font-bold tabular-nums leading-none text-amber-700">
          {waiting}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Aguardando
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center px-3 py-2.5">
        <span className="text-xl font-bold tabular-nums leading-none text-emerald-700">
          {finalized}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Finalizadas
        </span>
      </div>
    </div>
  );
}
