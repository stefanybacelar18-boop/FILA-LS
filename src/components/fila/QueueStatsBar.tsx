import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";

type QueueStatsBarProps = {
  waiting: number;
  called: number;
  total?: number;
  className?: string;
};

export function QueueStatsBar({ waiting, called, total, className }: QueueStatsBarProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <StatCard title="Aguardando" value={waiting} accent="amber" />
      <StatCard title="Chamados" value={called} accent="blue" />
      {total != null && <StatCard title="Exibindo" value={total} accent="brand" />}
    </div>
  );
}
