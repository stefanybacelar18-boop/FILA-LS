"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { resolveQueuePosition } from "@/lib/queue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Card";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { CheckinBlockedAlert } from "@/components/motorista/CheckinBlockedAlert";
import { LinkButton } from "@/components/ui/LinkButton";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { Spinner } from "@/components/ui/Spinner";
import type { Profile, QueueEntry } from "@/lib/types";
import { MOTORISTA_CHECKIN, FILA_DESCARGA_PUBLIC } from "@/lib/constants";
import { ClipboardList, RefreshCw, ArrowRight } from "lucide-react";

export function DriverQueuePanel() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => (
        <Suspense
          fallback={
            <MotoristaShell profile={profile}>
              <div className="flex justify-center py-16">
                <Spinner label="Carregando fila…" />
              </div>
            </MotoristaShell>
          }
        >
          <DriverQueueContent profile={profile} />
        </Suspense>
      )}
    </AuthGate>
  );
}

function DriverQueueContent({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entry, allEntries, loading, refresh } = useDriverQueueData(profile);
  const geo = useMotoristaGeofence(!loading);

  const hasEntry = !!entry;
  const checkinNavEnabled = hasEntry || geo.canCheckIn;
  const geoLoading = geo.step === "loading" && !geo.skipGeofence;
  const checkinBlocked = !hasEntry && !geo.canCheckIn && !geoLoading;
  const redirectedFromCheckin =
    searchParams.get("fila") === "1" || searchParams.get("motivo") === "fora";

  useEffect(() => {
    if (loading || geoLoading || hasEntry) return;
    if (geo.canCheckIn && !redirectedFromCheckin) {
      router.replace(MOTORISTA_CHECKIN);
    }
  }, [loading, geoLoading, hasEntry, geo.canCheckIn, router, redirectedFromCheckin]);

  const blockHint = checkinBlocked
    ? geo.step === "outside"
      ? "Check-in bloqueado — fora do pátio"
      : geo.step === "denied"
        ? "Check-in bloqueado — ative o GPS"
        : "Check-in bloqueado — valide a localização"
    : null;

  const showLoading = loading || (!hasEntry && geoLoading);
  const posicao = entry
    ? resolveQueuePosition(entry as QueueEntry, allEntries as QueueEntry[])
    : null;

  return (
    <MotoristaShell
      profile={profile}
      checkinNavEnabled={checkinNavEnabled}
      checkinBlockHint={blockHint}
    >
      {showLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando fila…" />
        </div>
      ) : hasEntry ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-600">Sua posição na fila</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl p-2 text-brand hover:bg-slate-100"
              aria-label="Atualizar fila"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>

          <Card className="card-brand py-6 text-center" aria-live="polite">
            <p className="text-sm font-medium uppercase text-slate-500">Posição</p>
            <p className="mt-1 text-6xl font-black text-brand">
              {posicao != null ? `${posicao}º` : "—"}
            </p>
            <div className="mt-3 flex justify-center">
              <StatusBadge status={entry.status} className="px-4 py-1 text-sm" />
            </div>
            <p className="mt-4 text-lg font-bold text-brand">{entry.minuta || "—"}</p>
            {entry.nome?.trim() && (
              <p className="mt-2 text-sm font-semibold text-slate-700">{entry.nome.trim()}</p>
            )}
          </Card>

          <MotoristaQueueList
            entries={allEntries as QueueEntry[]}
            highlightId={entry.id}
            title="Fila do pátio"
            showStatus
          />

          <p className="text-center text-xs text-slate-400">Atualização em tempo real</p>
        </div>
      ) : checkinBlocked ? (
        <div className="space-y-4">
          <CheckinBlockedAlert
            step={geo.step}
            distanceLabel={geo.distanceLabel}
            geofenceName={geo.geofence.name}
            onRetry={geo.retry}
            redirectedFromCheckin={redirectedFromCheckin}
          />

          {allEntries.length > 0 ? (
            <MotoristaQueueList entries={allEntries as QueueEntry[]} title="Fila do pátio" />
          ) : (
            <p className="text-center text-sm text-slate-500">Nenhum veículo na fila no momento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="panel-card">
            <div className="panel-card__icon">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="panel-card__title">Faça seu check-in</h2>
            <p className="panel-card__desc">
              Você está no pátio. Preencha os dados da carga para entrar na fila.
            </p>
            <LinkButton href="/checkin" className="mt-6 w-full py-3.5 text-base">
              Iniciar check-in
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>

          {allEntries.length > 0 && (
            <MotoristaQueueList entries={allEntries as QueueEntry[]} title="Fila do pátio" />
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        <Link href={FILA_DESCARGA_PUBLIC} className="font-semibold text-brand hover:underline">
          Ver fila pública
        </Link>
      </p>
    </MotoristaShell>
  );
}
