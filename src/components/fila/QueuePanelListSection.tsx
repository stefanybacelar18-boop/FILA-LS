"use client";

import type { QueueEntry } from "@/lib/types";
import { isActiveQueueStatus } from "@/lib/queue";
import { cn } from "@/lib/utils";
import { EmpilhadorQueueCard } from "@/components/fila/EmpilhadorQueueCard";

type QueuePanelListSectionProps = {
  list: QueueEntry[];
  selectedId: string | null;
  nextToCallId: string | null;
  isAdmin: boolean;
  onSelect: (entry: QueueEntry) => void;
  sectionLabel?: string;
  startIndex?: number;
  cardVariant?: "default" | "admin";
};

export function QueuePanelListSection({
  list,
  selectedId,
  nextToCallId,
  isAdmin,
  onSelect,
  sectionLabel,
  startIndex = 0,
  cardVariant,
}: QueuePanelListSectionProps) {
  const variant = cardVariant ?? (isAdmin ? "admin" : "default");

  return (
    <div className={cn("space-y-1.5", isAdmin && "space-y-2.5")}>
      {sectionLabel && (
        <div
          className={cn(
            "flex items-baseline justify-between gap-2 px-0.5",
            isAdmin ? "pb-0.5 pt-3 first:pt-0" : "pt-1"
          )}
        >
          <p className="section-eyebrow">{sectionLabel}</p>
          <span className="text-[11px] font-medium tabular-nums text-slate-400">
            {list.length} {list.length === 1 ? "veículo" : "veículos"}
          </span>
        </div>
      )}
      {list.map((entry, idx) => (
        <EmpilhadorQueueCard
          key={entry.id}
          entry={entry}
          position={startIndex + idx + 1}
          selected={selectedId === entry.id}
          isNext={entry.id === nextToCallId && isActiveQueueStatus(entry.status)}
          onClick={() => onSelect(entry)}
          variant={variant}
        />
      ))}
    </div>
  );
}
