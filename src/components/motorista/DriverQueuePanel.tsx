"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import { useDriverQueueContext } from "@/contexts/DriverQueueContext";
import { countVehiclesAhead, resolveQueuePosition } from "@/lib/queue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { CheckinBlockedAlert } from "@/components/motorista/CheckinBlockedAlert";
import { LinkButton } from "@/components/ui/LinkButton";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { QueuePositionHero } from "@/components/ui/PageHeader";
import type { Profile, QueueEntry } from "@/lib/types";
import { MOTORISTA_CHECKIN, FILA_DESCARGA_PUBLIC } from "@/lib/constants";
import { formatPrevisaoDate } from "@/lib/utils";
import { ClipboardList, ArrowRight } from "lucide-react";

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

function DriverQueueFilaSection({
  entries,
  highlightId,
  searchQuery,
  onSearchChange,
  showStatus = false,
}: {
  entries: QueueEntry[];
  highlightId?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showStatus?: boolean;
}) {
  return (
    <MotoristaQueueList
      entries={entries}
      highlightId={highlightId}
      minimal
      showStatus={showStatus}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar minuta…"
    />
  );
}

function buildHeroDetail(aFrente: number, previsaoLabel: string | null): string {
  const fila =
    aFrente > 0
      ? `${aFrente} veículo${aFrente !== 1 ? "s" : ""} à frente`
      : "Próximo da fila";
  if (previsaoLabel) return `${fila} · Previsão ${previsaoLabel}`;
  return fila;
}

function DriverQueueContent({ profile }: { profile: Profile }) {
  return (
    <MotoristaShell profile={profile}>
      <DriverQueueInner />
    </MotoristaShell>
  );
}

function DriverQueueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entry, allEntries, loading, refresh } = useDriverQueueContext();
  const [minutaSearch, setMinutaSearch] = useState("");

  const hasEntry = !!entry;
  const geo = useMotoristaGeofence(!loading);
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

  const showLoading = loading || (!hasEntry && geoLoading);
  const entries = allEntries as QueueEntry[];
  const posicao = entry ? resolveQueuePosition(entry, entries) : null;
  const aFrente = entry ? countVehiclesAhead(entry, entries) : 0;
  const previsaoLabel = entry?.previsao_descarregamento
    ? formatPrevisaoDate(entry.previsao_descarregamento)
    : null;

  const listRefresh = <RefreshIconButton onRefresh={refresh} label="Atualizar fila" />;

  return (
    <>
      {showLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando fila…" />
        </div>
      ) : hasEntry ? (
        <div className="space-y-4">
          <QueuePositionHero
            label={`Minuta ${entry.minuta || "—"}`}
            value={posicao != null ? `${posicao}º` : "—"}
            detail={buildHeroDetail(aFrente, previsaoLabel)}
            trailing={listRefresh}
            footer={
              <div className="flex w-full justify-center">
                <StatusBadge status={entry.status} className="bg-white/95 shadow-sm" />
              </div>
            }
            className="hero-pattern"
          />

          <DriverQueueFilaSection
            entries={entries}
            highlightId={entry.id}
            searchQuery={minutaSearch}
            onSearchChange={setMinutaSearch}
            showStatus
          />
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

          {entries.length > 0 ? (
            <DriverQueueFilaSection
              entries={entries}
              searchQuery={minutaSearch}
              onSearchChange={setMinutaSearch}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Fila vazia no momento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="panel-card">
            <div className="panel-card__icon">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="panel-card__title">Check-in no pátio</h2>
            <p className="panel-card__desc">Entre na fila de descarregamento.</p>
            <LinkButton href="/checkin" className="touch-target mt-5 w-full py-3.5 text-base">
              Iniciar check-in
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>

          {entries.length > 0 && (
            <DriverQueueFilaSection
              entries={entries}
              searchQuery={minutaSearch}
              onSearchChange={setMinutaSearch}
            />
          )}
        </div>
      )}

      {!hasEntry && (
        <p className="mt-8 text-center text-xs text-slate-400">
          <Link href={FILA_DESCARGA_PUBLIC} className="text-brand hover:underline">
            Fila pública
          </Link>
        </p>
      )}
    </>
  );
}
