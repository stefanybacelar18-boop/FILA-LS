"use client";

import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { QueueDashboard } from "@/components/motorista/QueueDashboard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/lib/types";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { resolveQueuePosition, isDriverCalled } from "@/lib/queue";
import {
  ClipboardList,
  ArrowRight,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

export default function MotoristaHomePage() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => <MotoristaHomeContent profile={profile} />}
    </AuthGate>
  );
}

function MotoristaHomeContent({ profile }: { profile: Profile }) {
  const { entry, allEntries, loading } = useDriverQueueData(profile);

  const posicao = entry ? resolveQueuePosition(entry, allEntries) : null;

  return (
    <MotoristaShell profile={profile}>
      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando fila…" />
        </div>
      ) : entry ? (
        <div className="space-y-4">
          <div
            className="overflow-hidden rounded-2xl border border-brand/20 bg-brand-hero p-5 text-white shadow-[var(--shadow-premium)] hero-pattern"
            aria-live="polite"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm opacity-80">Você está na fila</p>
                <p className="mt-1 text-4xl font-black">{posicao != null ? `${posicao}º` : "—"}</p>
                <p className="mt-1 text-sm opacity-90">
                  Minuta {entry.minuta} · {getDisplayPlaca(entry)}
                </p>
              </div>
              <StatusBadge status={entry.status} className="border-white/30 bg-white/20 text-white" />
            </div>
            {isDriverCalled(entry) && entry.doca && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm">
                <MapPin className="h-4 w-4" />
                Dirija-se à {entry.doca}
              </div>
            )}
            <QueueEntryBadges
              entry={entry}
              compact
              layout="inline"
              className="mt-4 [&_span]:bg-white/15 [&_span]:text-white"
            />
          </div>

          <Link href="/minha-fila">
            <Button className="w-full py-3.5 text-base">
              Ver detalhes da fila
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <QueueDashboard entries={allEntries} highlightId={entry.id} title="Fila do pátio hoje" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-[var(--shadow-card)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted ring-1 ring-brand/10">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Faça seu check-in</h2>
            <p className="mt-2 text-sm text-slate-500">
              Preencha os dados da carga para entrar na fila de descarga.
            </p>
            <Link href="/checkin" className="mt-6 block">
              <Button className="w-full py-3.5 text-base">
                Iniciar check-in
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {allEntries.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {allEntries.length} carreta{allEntries.length !== 1 ? "s" : ""} na fila agora
              </div>
              <QueueDashboard entries={allEntries} title="Fila do pátio" />
            </>
          )}
        </div>
      )}
    </MotoristaShell>
  );
}
