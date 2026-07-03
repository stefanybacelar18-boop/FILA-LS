import type { QueueEntry } from "@/lib/types";
import {
  formatEntryArrivalDay,
  formatEntryArrivalTime,
  formatEntryFinishedDay,
  formatEntryFinishedTime,
} from "@/lib/queue-entry-dates";
import { isActiveQueueStatus } from "@/lib/constants";

export function QueueEntryDates({
  entry,
  compact = false,
}: {
  entry: Pick<QueueEntry, "created_at" | "status" | "finished_at" | "updated_at">;
  compact?: boolean;
}) {
  const active = isActiveQueueStatus(entry.status);
  const finishedDay = formatEntryFinishedDay(entry);
  const finishedTime = formatEntryFinishedTime(entry);

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Chegada</p>
          <p className="font-medium text-slate-800">{formatEntryArrivalDay(entry)}</p>
          <p className="text-slate-500">{formatEntryArrivalTime(entry)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Finalização</p>
          {active ? (
            <p className="font-medium text-amber-700">Em andamento</p>
          ) : (
            <>
              <p className="font-medium text-slate-800">{finishedDay}</p>
              {finishedTime && <p className="text-slate-500">{finishedTime}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Dia da chegada
        </dt>
        <dd className="mt-0.5 font-semibold text-slate-900">{formatEntryArrivalDay(entry)}</dd>
        <dd className="text-xs text-slate-500">{formatEntryArrivalTime(entry)}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Dia da finalização
        </dt>
        {active ? (
          <dd className="mt-0.5 font-semibold text-amber-700">Em andamento</dd>
        ) : (
          <>
            <dd className="mt-0.5 font-semibold text-slate-900">{finishedDay}</dd>
            {finishedTime && <dd className="text-xs text-slate-500">{finishedTime}</dd>}
          </>
        )}
      </div>
    </dl>
  );
}

export function QueueEntryDateCell({
  day,
  time,
  pending,
}: {
  day: string;
  time: string;
  pending?: boolean;
}) {
  if (pending) {
    return <span className="text-xs font-medium text-amber-700">Em andamento</span>;
  }
  return (
    <div>
      <p className="font-medium text-slate-900">{day}</p>
      {time && <p className="text-xs text-slate-500">{time}</p>}
    </div>
  );
}
