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
        setError("Permita o acesso à localização (GPS) no celular para confirmar a chegada.");
      } else {
        setError("Não foi possível ler o GPS. Verifique se a localização está ligada e tente de novo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inicioViagem = formatDateTime(entry.created_at);
  const previsao = formatPrevisaoDate(entry.previsao_descarregamento);

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border-2 border-brand/25 bg-gradient-to-br from-brand/15 via-white to-white shadow-md">
        <div className="border-b border-brand/10 bg-brand/5 px-4 py-3">
          <p className="text-center text-sm font-bold uppercase tracking-wide text-brand">
            Próximo passo
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              1
            </span>
            <p className="pt-1 text-base leading-relaxed text-slate-800">
              Dirija até o <strong>pátio do PAD</strong> com esta minuta:{" "}
              <strong>{entry.minuta || "—"}</strong>
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              2
            </span>
            <p className="pt-1 text-base leading-relaxed text-slate-800">
              Ao entrar no pátio, toque no <strong>botão verde grande</strong> abaixo com o GPS
              ligado.
            </p>
          </div>

          {geo.step === "loading" && (
            <div className="flex items-center justify-center gap-2 py-2 text-base text-slate-600">
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

          {error && <p className="alert-error text-left text-base">{error}</p>}

          <Button
            type="button"
            className="touch-target min-h-[4.25rem] w-full gap-3 rounded-2xl py-5 text-lg font-bold shadow-lg"
            size="lg"
            disabled={submitting}
            onClick={() => void confirmArrival()}
          >
            {submitting ? (
              <Spinner size="md" className="h-6 w-6" />
            ) : (
              <>
                <MapPin className="h-7 w-7 shrink-0" strokeWidth={2.5} />
                CHEGUEI NO PÁTIO DO PAD
              </>
            )}
          </Button>

          <p className="text-center text-sm font-medium text-slate-600">
            Só depois disso você entra na fila de descarregamento.
          </p>
        </div>
      </div>

      <div className="hero-pattern rounded-2xl border border-brand/15 bg-gradient-to-br from-brand/10 to-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand/80">
              Minuta {entry.minuta || "—"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Viagem em andamento</h2>
            <p className="mt-1 text-base text-slate-600">
              Você ainda <strong>não está na fila</strong> — aguardando chegada no pátio.
            </p>
          </div>
          <StatusBadge status={entry.status} className="shrink-0 bg-white/95 shadow-sm" />
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Início da viagem</dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-900">{inicioViagem}</dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Previsão de descarregamento</dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-900">{previsao}</dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Placa</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold text-slate-900">
              {getDisplayPlaca(entry)}
            </dd>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2.5">
            <dt className="text-xs font-medium text-slate-500">Transportadora</dt>
            <dd className="mt-0.5 text-base font-semibold text-slate-900">
              {entry.transportadora || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Truck className="h-5 w-5 shrink-0 text-brand" />
        <p>
          Dúvidas na portaria? Mostre a minuta <strong>{entry.minuta || "—"}</strong> e informe que
          já fez o check-in no app.
        </p>
      </div>
    </div>
  );
}
