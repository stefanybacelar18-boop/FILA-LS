"use client";

import { Clock } from "lucide-react";
import type { CheckinCooldownBlock } from "@/lib/checkin-rules";
import { formatCheckinCooldownMessage } from "@/lib/checkin-rules";

export function CheckinCooldownAlert({ block }: { block: CheckinCooldownBlock }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden />
        <div className="space-y-2 text-sm leading-relaxed text-amber-950">
          <p className="text-base font-bold">Novo check-in ainda não disponível</p>
          <p>{formatCheckinCooldownMessage(block)}</p>
          <p className="text-xs text-amber-800">
            Enquanto isso, acompanhe sua posição na aba Fila. Se precisar entrar na fila
            antes desse prazo, procure a administração do pátio.
          </p>
        </div>
      </div>
    </div>
  );
}
