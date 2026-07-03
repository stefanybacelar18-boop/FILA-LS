"use client";

import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { countVehiclesAhead, isDriverCalled, resolveQueuePosition } from "@/lib/queue";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { QueueDashboard } from "@/components/motorista/QueueDashboard";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import { Button } from "@/components/ui/Button";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import type { Profile } from "@/lib/types";
import { Users, MapPin, RefreshCw } from "lucide-react";

export function DriverQueuePanel() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => <DriverQueueContent profile={profile} />}
    </AuthGate>
  );
}

function DriverQueueContent({ profile }: { profile: Profile }) {
  const { entry, allEntries, loading, refresh } = useDriverQueueData(profile);

  if (loading) {
    return <PageLoader message="Carregando fila…" />;
  }

  if (!entry) {
    return (
      <MotoristaShell profile={profile}>
        <div className="py-8 text-center">
          <p className="text-slate-600">Nenhum check-in ativo.</p>
          <Link href="/checkin" className="mt-4 inline-block">
            <Button>Fazer check-in</Button>
          </Link>
        </div>
      </MotoristaShell>
    );
  }

  const veiculosAFrente = Math.max(0, countVehiclesAhead(entry, allEntries));
  const posicao = resolveQueuePosition(entry, allEntries) ?? veiculosAFrente + 1;

  return (
    <MotoristaShell profile={profile}>
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
          <p className="mt-1 text-6xl font-black text-brand">{posicao}º</p>
          <div className="mt-3 flex justify-center">
            <StatusBadge status={entry.status} className="px-4 py-1 text-sm" />
          </div>
          <QueueEntryBadges entry={entry} className="mt-3 items-center" />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="card-brand py-4 text-center">
            <Users className="mx-auto h-6 w-6 text-brand" />
            <p className="mt-1 text-2xl font-bold">{veiculosAFrente}</p>
            <p className="text-xs text-slate-500">À frente</p>
          </Card>
          <Card className="card-brand py-4 text-center">
            <p className="text-2xl font-bold text-brand">{getDisplayPlaca(entry)}</p>
            <p className="text-xs text-slate-500">Sua placa</p>
          </Card>
        </div>

        {isDriverCalled(entry) && (
          <div className="rounded-2xl bg-brand p-5 text-center text-white shadow-lg" role="status">
            <MapPin className="mx-auto mb-2 h-8 w-8" />
            <p className="text-xl font-bold">Você foi chamado!</p>
            <p className="mt-1">Dirija-se {entry.doca ? `à ${entry.doca}` : "à doca indicada"}.</p>
          </div>
        )}

        <QueueDashboard entries={allEntries} highlightId={entry.id} />

        <p className="text-center text-xs text-slate-400">Atualização em tempo real</p>
      </div>
    </MotoristaShell>
  );
}
