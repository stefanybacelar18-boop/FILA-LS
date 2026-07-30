"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/AuthGate";
import { useDriverQueueContext } from "@/contexts/DriverQueueContext";
import { countVehiclesAhead, resolveQueuePosition } from "@/lib/queue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { MotoristaEmViagemPanel } from "@/components/motorista/MotoristaEmViagemPanel";
import { ViagemProgressTracker } from "@/components/motorista/ViagemProgressTracker";
import { isEmViagemStatus } from "@/lib/constants";
import { LinkButton } from "@/components/ui/LinkButton";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { QueuePositionHero } from "@/components/ui/PageHeader";
import type { Profile, QueueEntry } from "@/lib/types";
import { FILA_DESCARGA_PUBLIC } from "@/lib/constants";
import { formatPrevisaoDate } from "@/lib/utils";
import { ClipboardList, ArrowRight } from "lucide-react";

export function DriverQueuePanel() {
  return (
    <AuthGate roles={["motorista"]} loginPath="/login/motorista">
      {(profile) => (
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] justify-center py-16">
              <Spinner label="Carregando…" />
            </div>
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
      : "Você é o próximo";
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
  const searchParams = useSearchParams();
  const { entry, allEntries, loading, refresh } = useDriverQueueContext();
  const [minutaSearch, setMinutaSearch] = useState("");
  const [registradoAgora, setRegistradoAgora] = useState(false);
  const [importWarning, setImportWarning] = useState(false);

  useEffect(() => {
    if (searchParams.get("registrado") !== "1") return;
    setRegistradoAgora(true);
    if (searchParams.get("warning") === "minuta_nao_importada") {
      setImportWarning(true);
    }
    window.history.replaceState({}, "", "/motorista");
    const timer = window.setTimeout(() => setRegistradoAgora(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const hasEntry = !!entry;
  const inQueue = hasEntry && entry && !isEmViagemStatus(entry.status);
  const emViagem = hasEntry && entry && isEmViagemStatus(entry.status);

  const showLoading = loading;
  const entries = allEntries as QueueEntry[];
  const posicao = inQueue && entry ? resolveQueuePosition(entry, entries) : null;
  const aFrente = inQueue && entry ? countVehiclesAhead(entry, entries) : 0;
  const previsaoLabel = entry?.previsao_descarregamento
    ? formatPrevisaoDate(entry.previsao_descarregamento)
    : null;

  const listRefresh = <RefreshIconButton onRefresh={refresh} label="Atualizar fila" />;

  return (
    <>
      {showLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <Spinner label="Carregando…" />
        </div>
      ) : emViagem && entry ? (
        <>
          {importWarning && (
            <div
              className="mx-auto mb-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950"
              role="status"
            >
              Minuta não encontrada na base do admin. Confirme o número com a operação — sua viagem
              foi registrada.
            </div>
          )}
          <MotoristaEmViagemPanel
            entry={entry}
            onArrived={() => void refresh()}
            registradoAgora={registradoAgora}
          />
        </>
      ) : inQueue && entry ? (
        <div className="mx-auto max-w-md space-y-4">
          <ViagemProgressTracker etapaAtual="fila" />

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
      ) : (
        <div className="mx-auto max-w-md space-y-4">
          <div className="panel-card">
            <div className="panel-card__icon">
              <ClipboardList className="h-7 w-7 text-brand" />
            </div>
            <h2 className="panel-card__title">Registrar viagem</h2>
            <p className="panel-card__desc text-base">
              Toque abaixo após o carregamento em Belém.
            </p>
            <LinkButton href="/checkin" className="touch-target mt-5 w-full py-4 text-lg font-bold">
              Fazer check-in
              <ArrowRight className="h-5 w-5" />
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
            Ver fila pública
          </Link>
        </p>
      )}
    </>
  );
}
