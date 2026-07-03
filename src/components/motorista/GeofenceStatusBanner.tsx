"use client";

import { MapPin, Navigation, XCircle } from "lucide-react";
import { OUTSIDE_GEOFENCE_MESSAGE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import type { GeofenceStep } from "@/hooks/useMotoristaGeofence";

type Props = {
  step: GeofenceStep;
  distanceLabel?: string | null;
  onRetry?: () => void;
  /** true = banner na home (acompanhar fila); false = tela de check-in */
  variant?: "home" | "checkin";
};

export function GeofenceStatusBanner({
  step,
  distanceLabel,
  onRetry,
  variant = "home",
}: Props) {
  if (step === "loading" || step === "inside" || step === "skipped") return null;

  const isHome = variant === "home";

  return (
    <div
      className={
        isHome
          ? "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
          : "rounded-xl bg-red-50 p-4 text-danger"
      }
      role="status"
    >
      <div className="flex gap-3">
        {isHome ? (
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        ) : (
          <XCircle className="h-6 w-6 shrink-0" />
        )}
        <div className="space-y-2 text-sm leading-relaxed">
          <p className="font-semibold">
            {step === "outside"
              ? isHome
                ? "Você está fora do pátio"
                : OUTSIDE_GEOFENCE_MESSAGE
              : step === "denied"
                ? "Ative a localização (GPS) no celular."
                : step === "insecure"
                  ? "GPS indisponível — use HTTPS (app Vercel)."
                  : "Não foi possível obter o GPS."}
          </p>
          {step === "outside" && (
            <>
              {distanceLabel && (
                <p className={isHome ? "text-amber-900/80" : undefined}>
                  Distância do pátio: <strong>{distanceLabel}</strong>
                </p>
              )}
              {isHome && (
                <p className="text-amber-900/90">
                  Acompanhe a fila abaixo. O check-in só é liberado dentro do perímetro
                  do pátio LSL.
                </p>
              )}
            </>
          )}
          {onRetry && step !== "insecure" && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <Navigation className="h-3.5 w-3.5" />
              Atualizar localização
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
