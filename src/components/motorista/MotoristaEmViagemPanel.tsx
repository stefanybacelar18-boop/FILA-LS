"use client";

import { useState } from "react";
import { MapPin, Truck } from "lucide-react";
import type { QueueEntry } from "@/lib/types";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { OUTSIDE_GEOFENCE_MESSAGE } from "@/lib/constants";
import { getDeviceId, getUserAgent } from "@/lib/checkin-rules";
import { formatDateTime, formatPrevisaoDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { GeofenceStatusBanner } from "@/components/motorista/GeofenceStatusBanner";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { getCurrentPosition } from "@/lib/geofence";

type Props = {
  entry: QueueEntry;
  onArrived: () => void;
};

export function MotoristaEmViagemPanel({ entry, onArrived }: Props) {
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
        setError("Permita o acesso à localização (GPS) para confirmar a chegada no pátio.");
      } else {
        setError("Falha ao obter GPS. Verifique se a localização está ativa e tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inicioViagem = formatDateTime(entry.created_at);
  const previsao = formatPrevisaoDate(entry.previsao_descarregamento);

  return (
    <div className="space-y-4">
      <div className="hero-pattern rounded-2xl border border-brand/15 bg-gradient-to-br from-brand/10 to-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand/80">
              Minuta {entry.minuta || "—"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Em viagem para o PAD</h2>
            <p className="mt-1 text-sm text-slate-600">
              Você ainda não está na fila de descarregamento.
            </p>
          </div>
          <StatusBadge status={entry.status} className="shrink-0 bg-white/95 shadow-sm" />
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Início da viagem</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{inicioViagem}</dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Previsão de descarregamento</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{previsao}</dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Placa</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900">
              {getDisplayPlaca(entry)}
            </dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Transportadora</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{entry.transportadora || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="panel-card space-y-4">
        <div className="flex items-center gap-2 text-brand">
          <Truck className="h-5 w-5" />
          <h3 className="font-semibold">Chegada no pátio</h3>
        </div>
        <p className="text-sm text-slate-600">
          Ao entrar no pátio do PAD, toque no botão abaixo com o <strong>GPS ligado</strong> para
          entrar na fila de descarregamento.
        </p>

        {geo.step === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner size="sm" />
            Verificando localização…
          </div>
        )}

        {(geo.step === "outside" || geo.step === "denied" || geo.step === "error") && (
          <GeofenceStatusBanner
            variant="checkin"
            step={geo.step}
            distanceLabel={geo.distanceLabel}
            onRetry={geo.retry}
          />
        )}

        {error && <p className="alert-error text-left text-sm">{error}</p>}

        <Button
          type="button"
          className="touch-target w-full py-4 text-base"
          size="lg"
          disabled={submitting}
          onClick={() => void confirmArrival()}
        >
          {submitting ? (
            <Spinner size="md" className="h-5 w-5" />
          ) : (
            <>
              <MapPin className="h-5 w-5" />
              Cheguei no pátio do PAD
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
