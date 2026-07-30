"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { QueueEntry } from "@/lib/types";
import { OUTSIDE_GEOFENCE_MESSAGE } from "@/lib/constants";
import { getDeviceId, getUserAgent } from "@/lib/checkin-rules";
import { formatPrevisaoDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { GeofenceStatusBanner } from "@/components/motorista/GeofenceStatusBanner";
import { ViagemProgressTracker } from "@/components/motorista/ViagemProgressTracker";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { getCurrentPosition } from "@/lib/geofence";

type Props = {
  entry: QueueEntry;
  onArrived: () => void;
  registradoAgora?: boolean;
};

export function MotoristaEmViagemPanel({ entry, onArrived, registradoAgora }: Props) {
  const geo = useMotoristaGeofence(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmArrival() {
    setSubmitting(true);
    setError(null);

    try {
      let lat: number;
      let lng: number;

      if (geo.coords && geo.canCheckIn) {
        lat = geo.coords.lat;
        lng = geo.coords.lng;
      } else {
        const position = await getCurrentPosition();
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }

      const res = await fetch("/api/checkin/chegada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chegada_lat: lat,
          chegada_lng: lng,
          device_id: getDeviceId(),
          user_agent: getUserAgent(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        detail?: string;
      };

      if (!res.ok) {
        if (data.error === "outside_geofence") {
          setError(OUTSIDE_GEOFENCE_MESSAGE);
          void geo.retry();
          return;
        }
        setError(data.message ?? data.detail ?? "Não foi possível confirmar a chegada.");
        return;
      }

      onArrived();
    } catch (err) {
      const ge = err as GeolocationPositionError;
      if (ge?.code === 1) {
        setError("Ative o GPS no celular e permita o acesso à localização.");
      } else {
        setError("Não foi possível ler o GPS. Verifique se a localização está ligada.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const previsao = formatPrevisaoDate(entry.previsao_descarregamento);

  return (
    <div className="mx-auto max-w-md space-y-4">
      {registradoAgora && (
        <div
          className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 text-center"
          role="status"
        >
          <p className="text-lg font-bold text-emerald-900">Viagem registrada!</p>
          <p className="mt-1 text-base text-emerald-800">
            Siga até o PAD. Ao chegar, toque no botão verde abaixo.
          </p>
        </div>
      )}

      <ViagemProgressTracker etapaAtual="transito" />

      <div className="rounded-2xl bg-brand px-5 py-6 text-center text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-white/80">Sua minuta</p>
        <p className="mt-1 text-4xl font-black tracking-tight">{entry.minuta || "—"}</p>
        <p className="mt-3 text-base text-white/90">
          Previsão de descarga: <strong>{previsao}</strong>
        </p>
      </div>

      <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
        <p className="text-center text-lg font-bold text-emerald-950">
          Chegou no pátio do PAD?
        </p>
        <p className="mt-2 text-center text-base text-emerald-900">
          Toque no botão com o GPS ligado para entrar na fila.
        </p>

        {geo.step === "loading" && (
          <div className="mt-4 flex items-center justify-center gap-2 text-base text-slate-600">
            <Spinner size="sm" />
            Verificando GPS…
          </div>
        )}

        {(geo.step === "outside" || geo.step === "denied" || geo.step === "error") && (
          <div className="mt-4">
            <GeofenceStatusBanner
              variant="checkin"
              step={geo.step}
              distanceLabel={geo.distanceLabel}
              onRetry={geo.retry}
            />
          </div>
        )}

        {error && <p className="alert-error mt-4 text-left text-base">{error}</p>}

        <Button
          type="button"
          className="touch-target mt-4 min-h-[4.5rem] w-full gap-3 rounded-2xl border-2 border-emerald-700 bg-emerald-600 py-5 text-xl font-black text-white shadow-lg hover:bg-emerald-700"
          size="lg"
          disabled={submitting}
          onClick={() => void confirmArrival()}
        >
          {submitting ? (
            <Spinner size="md" className="h-7 w-7" />
          ) : (
            <>
              <MapPin className="h-8 w-8 shrink-0" strokeWidth={2.5} />
              CHEGUEI NO PÁTIO
            </>
          )}
        </Button>
      </div>

      <p className="px-2 text-center text-sm text-slate-500">
        Você ainda não está na fila. A posição só aparece depois de confirmar a chegada.
      </p>
    </div>
  );
}
