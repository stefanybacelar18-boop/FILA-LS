"use client";

import { AlertTriangle, MapPinOff, Navigation, ShieldAlert } from "lucide-react";
import { OUTSIDE_GEOFENCE_MESSAGE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import type { GeofenceStep } from "@/hooks/useMotoristaGeofence";

type Props = {
  step: GeofenceStep;
  distanceLabel?: string | null;
  geofenceName?: string;
  onRetry?: () => void;
  /** Veio do redirect /checkin → /motorista */
  redirectedFromCheckin?: boolean;
};

function titleForStep(step: GeofenceStep): string {
  switch (step) {
    case "outside":
      return "Check-in bloqueado — você está fora do pátio";
    case "denied":
      return "Check-in bloqueado — GPS desligado";
    case "insecure":
      return "Check-in bloqueado — GPS indisponível";
    case "error":
      return "Check-in bloqueado — não foi possível validar GPS";
    default:
      return "Check-in indisponível no momento";
  }
}

function bodyForStep(step: GeofenceStep, geofenceName?: string): string {
  switch (step) {
    case "outside":
      return (
        OUTSIDE_GEOFENCE_MESSAGE +
        (geofenceName ? ` Área permitida: ${geofenceName}.` : "") +
        " Você pode acompanhar a fila abaixo, mas só entra na fila após o check-in dentro do pátio."
      );
    case "denied":
      return "Permita o acesso à localização no celular (Chrome/Safari → Configurações → Localização). Sem GPS não é possível confirmar que você está no pátio LSL.";
    case "insecure":
      return "O navegador só libera GPS em conexão segura (HTTPS). Use o app FilaDock instalado ou acesse o endereço oficial de produção (HTTPS).";
    case "error":
      return "Não conseguimos ler sua posição. Verifique se o GPS está ligado e tente novamente.";
    default:
      return "Aguarde a validação da localização ou tente atualizar.";
  }
}

/** Aviso grande e impossível de ignorar — check-in não liberado. */
export function CheckinBlockedAlert({
  step,
  distanceLabel,
  geofenceName,
  onRetry,
  redirectedFromCheckin,
}: Props) {
  if (step === "loading" || step === "inside" || step === "skipped") return null;

  return (
    <div
      className="overflow-hidden rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-50 shadow-[var(--shadow-card)]"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2 border-b border-red-200/80 bg-red-100/80 px-4 py-2.5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-red-700" />
        <p className="text-sm font-bold uppercase tracking-wide text-red-800">
          Check-in não permitido agora
        </p>
      </div>

      <div className="space-y-3 p-4">
        {redirectedFromCheckin && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-100/90 px-3 py-2 text-sm font-medium text-amber-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Você tentou fazer check-in, mas ainda não está na área autorizada do pátio.
          </p>
        )}

        <div className="flex gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <MapPinOff className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-base font-bold leading-snug text-red-950">{titleForStep(step)}</p>
            <p className="text-sm leading-relaxed text-red-900/90">{bodyForStep(step, geofenceName)}</p>
            {step === "outside" && distanceLabel && (
              <p className="inline-flex rounded-lg bg-white/80 px-2.5 py-1 text-sm font-semibold text-red-800 ring-1 ring-red-200">
                Distância do pátio: {distanceLabel}
              </p>
            )}
          </div>
        </div>

        {onRetry && step !== "insecure" && (
          <Button
            type="button"
            variant="outline"
            className="w-full border-red-300 bg-white text-red-900 hover:bg-red-50"
            onClick={onRetry}
          >
            <Navigation className="h-4 w-4" />
            Atualizar minha localização
          </Button>
        )}
      </div>
    </div>
  );
}
