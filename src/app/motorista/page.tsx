"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { CheckinBlockedAlert } from "@/components/motorista/CheckinBlockedAlert";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/lib/types";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { resolveQueuePosition } from "@/lib/queue";
import { MOTORISTA_CHECKIN, FILA_DESCARGA_PUBLIC } from "@/lib/constants";
import { ClipboardList, ArrowRight, CheckCircle2, ListOrdered } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

export default function MotoristaHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner label="Carregando…" />
        </div>
      }
    >
      <AuthGate roles={["motorista"]} loginPath="/login/motorista">
        {(profile) => <MotoristaHomeContent profile={profile} />}
      </AuthGate>
    </Suspense>
  );
}

function MotoristaHomeContent({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entry, allEntries, loading: queueLoading } = useDriverQueueData(profile);
  const geo = useMotoristaGeofence(!queueLoading);

  const hasEntry = !!entry;
  const checkinNavEnabled = hasEntry || geo.canCheckIn;
  const geoLoading = geo.step === "loading" && !geo.skipGeofence;
  const checkinBlocked = !hasEntry && !geo.canCheckIn && !geoLoading;
  const redirectedFromCheckin =
    searchParams.get("fila") === "1" || searchParams.get("motivo") === "fora";

  useEffect(() => {
    if (queueLoading || geoLoading || hasEntry) return;
    if (geo.canCheckIn && !redirectedFromCheckin) {
      router.replace(MOTORISTA_CHECKIN);
    }
  }, [queueLoading, geoLoading, hasEntry, geo.canCheckIn, router, redirectedFromCheckin]);

  const posicao = entry ? resolveQueuePosition(entry, allEntries) : null;
  const loading = queueLoading || (!hasEntry && geoLoading);

  const blockHint = checkinBlocked
    ? geo.step === "outside"
      ? "Check-in bloqueado — fora do pátio"
      : geo.step === "denied"
        ? "Check-in bloqueado — ative o GPS"
        : "Check-in bloqueado — valide a localização"
    : null;

  return (
    <MotoristaShell
      profile={profile}
      checkinNavEnabled={checkinNavEnabled}
      checkinBlockHint={blockHint}
    >
      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando…" />
        </div>
      ) : entry ? (
        <div className="space-y-4">
          <div
            className="overflow-hidden rounded-2xl border border-brand/20 bg-brand-hero p-5 text-white shadow-[var(--shadow-premium)] hero-pattern"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm opacity-80">Você está na fila</p>
                <p className="mt-1 text-4xl font-black">{posicao != null ? `${posicao}º` : "—"}</p>
                <p className="mt-1 text-sm opacity-90">
                  Minuta {entry.minuta} · {getDisplayPlaca(entry)}
                </p>
              </div>
              <StatusBadge status={entry.status} className="border-white/30 bg-white/20 text-white" />
            </div>
          </div>

          <Link href="/minha-fila">
            <Button className="w-full py-3.5 text-base">
              Ver minha posição
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <MotoristaQueueList entries={allEntries} highlightId={entry.id} title="Fila do pátio" />
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

          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <ListOrdered className="mx-auto h-8 w-8 text-brand" />
            <h2 className="mt-3 text-lg font-bold text-slate-800">Acompanhe a fila</h2>
            <p className="mt-2 text-sm text-slate-600">
              Quando estiver dentro do pátio LSL, use <strong>Check-in</strong> no menu ou atualize
              sua localização acima.
            </p>
          </div>

          {allEntries.length > 0 ? (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {allEntries.length} carreta{allEntries.length !== 1 ? "s" : ""} na fila agora
              </div>
              <MotoristaQueueList entries={allEntries} title="Fila do pátio" />
            </>
          ) : (
            <p className="text-center text-sm text-slate-500">Nenhum veículo na fila no momento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-[var(--shadow-card)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted ring-1 ring-brand/10">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Faça seu check-in</h2>
            <p className="mt-2 text-sm text-slate-500">
              Você está no pátio. Preencha os dados da carga para entrar na fila.
            </p>
            <Link href="/checkin" className="mt-6 block">
              <Button className="w-full py-3.5 text-base">
                Iniciar check-in
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {allEntries.length > 0 && (
            <MotoristaQueueList entries={allEntries} title="Fila do pátio" />
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
