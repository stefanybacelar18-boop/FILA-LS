"use client";

import type { PublicQueueStats } from "@/lib/public-queue-stats";
import { StatCard } from "@/components/ui/StatCard";

export function PublicQueueStatsBar({ stats }: { stats: PublicQueueStats }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
      <StatCard title="Aguardando" value={stats.aguardando} accent="brand" />
      <StatCard title="Finalizados" value={stats.finalizados} accent="green" />
      <StatCard title="Ausentes" value={stats.ausentes} accent="amber" />
    </div>
  );
}
