import type { QueueEntry } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export function QueueCapacityAlertsBanner({ entries }: { entries: QueueEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Estoque sem espaço para algumas minutas hoje
      </p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="font-semibold">{entry.minuta ?? "—"}</span>
            {" — "}
            {entry.capacidade_aviso}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        Previsão automática vai para o próximo dia útil. Se descarregar parcial, finalize a
        operação da minuta.
      </p>
    </div>
  );
}
