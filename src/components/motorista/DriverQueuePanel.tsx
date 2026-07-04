"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { resolveQueuePosition } from "@/lib/queue";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { CheckinBlockedAlert } from "@/components/motorista/CheckinBlockedAlert";
import { Button } from "@/components/ui/Button";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import type { Profile } from "@/lib/types";
import { RefreshCw } from "lucide-react";

export function DriverQueuePanel() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => <DriverQueueContent profile={profile} />}
    </AuthGate>
  );
}

function DriverQueueContent({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { entry, allEntries, loading, refresh } = useDriverQueueData(profile);
  const geo = useMotoristaGeofence(!loading && !entry);

  useEffect(() => {
    if (!loading && !entry && geo.isOutside && !geo.skipGeofence) {
      router.replace("/motorista?motivo=fora");
    }
  }, [loading, entry, geo.isOutside, geo.skipGeofence, router]);

  if (loading) {
    return <PageLoader message="Carregando fila…" />;
  }

  if (!entry) {
    if (geo.isOutside && !geo.skipGeofence) {
      return <PageLoader message="Redirecionando…" />;
    }
    const blocked = !geo.canCheckIn && geo.step !== "loading";
    return (
      <MotoristaShell
        profile={profile}
        checkinNavEnabled={geo.canCheckIn}
        checkinBlockHint={
          blocked ? "Check-in bloqueado — valide a localização" : undefined
        }
      >
        <div className="space-y-4 py-4">
          {blocked && (
            <CheckinBlockedAlert
              step={geo.step}
              distanceLabel={geo.distanceLabel}
              geofenceName={geo.geofence.name}
              onRetry={geo.retry}
            />
          )}
          <p className="text-center text-slate-600">Nenhum check-in ativo.</p>
          {geo.canCheckIn && (
            <Link href="/checkin" className="block">
              <Button className="w-full">Fazer check-in</Button>
            </Link>
          )}
          {allEntries.length > 0 && (
            <MotoristaQueueList entries={allEntries} title="Fila do pátio" />
          )}
        </div>
      </MotoristaShell>
    );
  }

  const posicao = resolveQueuePosition(entry, allEntries);

  return (
    <MotoristaShell profile={profile} checkinNavEnabled>
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl p-2 text-brand hover:bg-slate-100"
            aria-label="Atualizar"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        <Card className="card-brand py-6 text-center" aria-live="polite">
          <p className="text-sm font-medium uppercase text-slate-500">Sua posição</p>
          <p className="mt-1 text-6xl font-black text-brand">{posicao != null ? `${posicao}º` : "—"}</p>
          <div className="mt-3 flex justify-center">
            <StatusBadge status={entry.status} className="px-4 py-1 text-sm" />
          </div>
          <p className="mt-4 text-lg font-bold text-brand">{entry.minuta || "—"}</p>
          <p className="mt-1 font-mono text-sm text-slate-600">{getDisplayPlaca(entry)}</p>
        </Card>

        <MotoristaQueueList entries={allEntries} highlightId={entry.id} title="Fila do pátio" />

        <p className="text-center text-xs text-slate-400">Atualização em tempo real</p>
      </div>
    </MotoristaShell>
  );
}
