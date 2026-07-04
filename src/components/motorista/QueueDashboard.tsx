"use client";

import type { QueueEntry } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { isDriverCalled, compareQueueOrder, countVehiclesAhead } from "@/lib/queue";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { filterOperationalPanelEntries } from "@/lib/constants";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import { cn } from "@/lib/utils";
import { Truck, ListOrdered, Star } from "lucide-react";

interface QueueDashboardProps {
  entries: QueueEntry[];
  highlightId?: string;
  title?: string;
}

export function QueueDashboard({
  entries,
  highlightId,
  title = "Fila do pátio",
}: QueueDashboardProps) {
  const operational = filterOperationalPanelEntries(entries);
  const sorted = [...operational].sort(compareQueueOrder);
  const aguardando = sorted.filter((e) => !isDriverCalled(e)).length;
  const chamados = sorted.filter((e) => isDriverCalled(e)).length;

  return (
    <Card className="card-brand overflow-hidden p-0">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 pb-4 pt-4">
        <CardTitle className="flex items-center gap-2 text-base text-brand">
          <ListOrdered className="h-5 w-5" />
          {title}
        </CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <StatPill value={aguardando} label="Aguardando" tone="amber" />
          <StatPill value={chamados} label="Chamados" tone="blue" />
        </div>
      </CardHeader>

      {sorted.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Nenhuma minuta ativa na fila agora.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((entry) => {
            const isMine = entry.id === highlightId;
            const pos = countVehiclesAhead(entry, sorted) + 1;

            return (
              <li
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5",
                  isMine && "bg-brand-muted/70"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isMine ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {isMine ? <Truck className="h-4 w-4" /> : `${pos}º`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-bold text-brand">{entry.minuta || "—"}</p>
                    {isMine && (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                        Você
                      </span>
                    )}
                    {entryHasPrioridade(entry) && (
                      <Star className="h-3.5 w-3.5 text-amber-500" aria-label="Prioridade" />
                    )}
                  </div>
                  <p className="truncate font-mono text-sm text-slate-700">
                    {getDisplayPlaca(entry)}
                  </p>
                  <QueueEntryBadges entry={entry} compact className="mt-1" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={entry.status} />
                  {entry.doca && (
                    <span className="text-[10px] font-medium text-slate-500">{entry.doca}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-slate-100 px-4 py-2.5 text-center text-[10px] leading-relaxed text-slate-400">
        {sorted.length}{" "}
        {sorted.length === 1 ? "minuta ativa" : "minutas ativas"} · ordem por prioridade e
        check-in
      </p>
    </Card>
  );
}

function StatPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "amber" | "blue";
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-sky-50 text-sky-800",
  };
  return (
    <div className={cn("rounded-xl py-2.5", tones[tone])}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
