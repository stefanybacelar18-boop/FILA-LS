"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry, QueueStatus, Profile } from "@/lib/types";
import { toAppRole } from "@/lib/types";
import {
  sortQueueEntries,
  isDriverCalled,
  isActiveQueueStatus,
  normalizeQueueStatus,
  getNextToCall,
} from "@/lib/queue";
import { updateQueueEntryViaApi } from "@/lib/queue-api";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import { RacksVaziosBadge } from "@/components/fila/RacksVaziosBadge";
import { QueueEntryBadges } from "@/components/fila/QueueEntryBadges";
import {
  getQueuePermissions,
  statusOptionsForRole,
  assertStatusAllowed,
} from "@/lib/role-permissions";
import { getCallDriverWhatsAppLink } from "@/lib/whatsapp";
import { cn, formatPhone, isoToDateInput } from "@/lib/utils";
import { isEntryClosedToday } from "@/lib/queue-day";
import { createDebouncedFn } from "@/lib/debounce";
import { QueueEntryDates } from "@/components/fila/QueueEntryDates";
import { QueueEntryListItem } from "@/components/fila/QueueEntryListItem";
import { QueueStatsBar } from "@/components/fila/QueueStatsBar";
import { AppShell } from "@/components/layout/AppShell";
import {
  FieldStaffShell,
  FieldStaffPageTitle,
} from "@/components/layout/FieldStaffShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import {
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  UserX,
  Star,
  Zap,
  RotateCcw,
  X,
  PackageOpen,
  Filter,
} from "lucide-react";

type EmpilhadorFilter = "ativas" | "finalizadas" | "ausentes";

function sortClosedEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.finished_at ?? b.updated_at).getTime() -
      new Date(a.finished_at ?? a.updated_at).getTime()
  );
}

export function QueuePanel({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const appRole = toAppRole(profile.role);
  const permissions = getQueuePermissions(profile.role);
  const statusOptions = statusOptionsForRole(profile.role);
  const isEmpilhador = appRole === "empilhador";
  const isAdmin = appRole === "administrador";

  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<QueueStatus>("aguardando_descarregamento");
  const [editDoca, setEditDoca] = useState("");
  const [editPrevisao, setEditPrevisao] = useState("");
  const [editRetornoRacks, setEditRetornoRacks] = useState(false);
  const [editPrioridade, setEditPrioridade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFinalizados, setShowFinalizados] = useState(false);
  const [empilhadorFilter, setEmpilhadorFilter] = useState<EmpilhadorFilter>("ativas");

  const fetchQueue = useCallback(async () => {
      setFetchError(null);

      const needsFullDay =
        (isAdmin && showFinalizados) ||
        (isEmpilhador && empilhadorFilter !== "ativas");

      const params = new URLSearchParams();
      if (needsFullDay) params.set("scope", "all");
      params.set("_", String(Date.now()));
      const url = `/api/queue/today?${params.toString()}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: QueueEntry[];
      };

      if (!res.ok) {
        setFetchError(json.error ?? "Erro ao carregar fila");
        setLoading(false);
        return;
      }

      setEntries(sortQueueEntries(json.data ?? []));
      setLoading(false);
    },
    [showFinalizados, isAdmin, isEmpilhador, empilhadorFilter]
  );

  async function refreshAfterSave(statusChanged?: QueueStatus) {
    if (statusChanged === "finalizado" || statusChanged === "ausente") {
      setSelectedId(null);
      if ((isAdmin && showFinalizados) || (isEmpilhador && empilhadorFilter !== "ativas")) {
        await fetchQueue();
        return;
      }
    }
    if (statusChanged === "aguardando_descarregamento" && isEmpilhador) {
      setSelectedId(null);
      if (empilhadorFilter !== "ativas") {
        await fetchQueue();
        return;
      }
    }
    await fetchQueue();
  }

  useEffect(() => {
    fetchQueue();
    const debounced = createDebouncedFn(() => fetchQueue(), 400);
    const channel = supabase
      .channel(`queue-${profile.role}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () =>
        debounced.call()
      )
      .subscribe();
    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchQueue, profile.role]);

  function selectEntry(entry: QueueEntry) {
    setSelectedId(entry.id);
    const normalized = normalizeQueueStatus(entry.status);
    setEditStatus(
      permissions.editableStatuses.includes(normalized)
        ? normalized
        : permissions.editableStatuses[0] ?? normalized
    );
    setEditDoca(entry.doca ?? "");
    setEditPrevisao(isoToDateInput(entry.previsao_descarregamento));
    setEditRetornoRacks(entryRetornoRacksVazios(entry));
    setEditPrioridade(entryHasPrioridade(entry));
  }

  async function savePrioridade(checked: boolean) {
    if (!selectedId || !permissions.canSetPrioridade) return;

    const previous = editPrioridade;
    setEditPrioridade(checked);
    setSaving(true);

    const { error, data } = await updateQueueEntryViaApi({
      entryId: selectedId,
      prioridade: checked,
    });

    setSaving(false);

    if (error) {
      setEditPrioridade(previous);
      alert(`Erro ao salvar prioridade: ${error}`);
      return;
    }

    const saved = data ? entryHasPrioridade(data) : checked;
    setEditPrioridade(saved);

    if (data) {
      setEntries((prev) =>
        sortQueueEntries(prev.map((e) => (e.id === selectedId ? { ...e, ...data, prioridade: saved } : e)))
      );
    }
  }

  async function applyStatus(
    entryId: string,
    status: QueueStatus,
    fromStatus?: string
  ) {
    if (!assertStatusAllowed(profile.role, status, fromStatus)) {
      alert("Seu perfil não pode alterar para este status.");
      return;
    }

    setSaving(true);
    const { error } = await updateQueueEntryViaApi({ entryId, status });

    setSaving(false);
    if (error) {
      alert(`Erro ao salvar: ${error}`);
      return;
    }
    await refreshAfterSave(status);
  }

  async function handleUpdate() {
    if (!selectedId) return;
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) return;

    setSaving(true);

    if (isEmpilhador && isActiveQueueStatus(entry.status)) {
      const payload: {
        entryId: string;
        doca?: string | null;
        prioridade?: boolean;
        previsao_descarregamento?: string | null;
      } = { entryId: selectedId };
      if (permissions.canEditDoca) payload.doca = editDoca || null;
      if (permissions.canSetPrioridade) payload.prioridade = editPrioridade;
      if (permissions.canEditPrevisao) {
        payload.previsao_descarregamento = editPrevisao ? editPrevisao : null;
      }

      const { error } = await updateQueueEntryViaApi(payload);
      setSaving(false);
      if (error) {
        alert(`Erro ao salvar: ${error}`);
        return;
      }
      fetchQueue();
      return;
    }

    if (!assertStatusAllowed(profile.role, editStatus, entry.status)) {
      setSaving(false);
      alert("Status não permitido para seu perfil.");
      return;
    }

    const statusChanged = normalizeQueueStatus(entry.status) !== editStatus;

    const { error: statusError } = await updateQueueEntryViaApi({
      entryId: selectedId,
      ...(statusChanged ? { status: editStatus } : {}),
      doca: permissions.canEditDoca ? editDoca || null : undefined,
      prioridade: permissions.canSetPrioridade ? editPrioridade : undefined,
      previsao_descarregamento: permissions.canEditPrevisao
        ? editPrevisao
          ? editPrevisao
          : null
        : undefined,
      retorno_racks_vazios: permissions.canEditRetornoRacks
        ? editRetornoRacks
        : undefined,
    });

    setSaving(false);
    if (statusError) {
      alert(`Erro ao salvar: ${statusError}`);
      return;
    }
    await refreshAfterSave(editStatus);
  }

  async function chamarParaDoca(entry: QueueEntry, docaOverride?: string) {
    if (!permissions.canChamarWhatsApp) return;

    const doca = docaOverride ?? (editDoca.trim() || entry.doca?.trim() || "Doca 1");
    setSaving(true);

    if (
      selectedId === entry.id &&
      isActiveQueueStatus(entry.status) &&
      (permissions.canEditDoca || permissions.canEditPrevisao)
    ) {
      const { error: fieldsError } = await updateQueueEntryViaApi({
        entryId: entry.id,
        ...(permissions.canEditDoca ? { doca: doca || null } : {}),
        ...(permissions.canEditPrevisao
          ? { previsao_descarregamento: editPrevisao ? editPrevisao : null }
          : {}),
        called_at: new Date().toISOString(),
      });

      if (fieldsError) {
        setSaving(false);
        alert(`Erro ao salvar doca/previsão: ${fieldsError}`);
        return;
      }
    } else {
      const { error: callError } = await updateQueueEntryViaApi({
        entryId: entry.id,
        doca: doca || null,
        called_at: new Date().toISOString(),
      });

      if (callError) {
        setSaving(false);
        alert(`Erro ao registrar chamada: ${callError}`);
        return;
      }
    }

    setSaving(false);

    setEditDoca(doca);
    const link = getCallDriverWhatsAppLink(
      entry.telefone,
      entry.minuta || entry.placa,
      doca
    );
    window.open(link, "_blank", "noopener,noreferrer");
    fetchQueue();
  }

  const activeEntries = entries.filter((e) => isActiveQueueStatus(e.status));
  const calledCount = activeEntries.filter((e) => isDriverCalled(e)).length;
  const waitingCount = activeEntries.length - calledCount;

  const displayedEntries = useMemo(() => {
    if (!isEmpilhador) return entries;
    if (empilhadorFilter === "finalizadas") {
      return sortClosedEntries(
        entries.filter(
          (e) =>
            normalizeQueueStatus(e.status) === "finalizado" && isEntryClosedToday(e)
        )
      );
    }
    if (empilhadorFilter === "ausentes") {
      return sortClosedEntries(
        entries.filter(
          (e) => normalizeQueueStatus(e.status) === "ausente" && isEntryClosedToday(e)
        )
      );
    }
    return entries.filter((e) => isActiveQueueStatus(e.status));
  }, [entries, isEmpilhador, empilhadorFilter]);

  const selected = entries.find((e) => e.id === selectedId);
  const selectedIsActive = selected ? isActiveQueueStatus(selected.status) : false;
  const nextToCall = getNextToCall(activeEntries);
  const nextToCallId = nextToCall?.id ?? null;

  function renderQueueList(
    list: QueueEntry[],
    variant: "admin" | "mobile",
    options?: { sectionLabel?: string; startIndex?: number }
  ) {
    const start = options?.startIndex ?? 0;
    return (
      <div className="space-y-2">
        {options?.sectionLabel && (
          <p className="section-eyebrow px-0.5 pt-1">{options.sectionLabel}</p>
        )}
        {list.map((entry, idx) => (
          <QueueEntryListItem
            key={entry.id}
            entry={entry}
            position={start + idx + 1}
            selected={selectedId === entry.id}
            isNext={entry.id === nextToCallId && isActiveQueueStatus(entry.status)}
            variant={variant}
            onClick={() => selectEntry(entry)}
          />
        ))}
      </div>
    );
  }

  const adminActiveList = isAdmin
    ? displayedEntries.filter((e) => isActiveQueueStatus(e.status))
    : [];
  const adminClosedList = isAdmin
    ? displayedEntries.filter((e) => !isActiveQueueStatus(e.status))
    : [];

  useEffect(() => {
    if (selected) {
      setEditPrioridade(entryHasPrioridade(selected));
    }
  }, [selected]);

  function renderEntryDetail() {
    if (!selected) {
      return (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Filter className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-600">Nenhuma minuta selecionada</p>
          <p className="mt-1 text-xs text-slate-400">
            Clique em um veículo na fila para editar status, doca e prioridade.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-brand">{selected.minuta || "—"}</p>
            <p className="mt-1 font-mono text-base font-semibold text-slate-900">
              {selected.placa_cavalo || selected.placa}
            </p>
            <p className="text-sm text-slate-600">
              {selected.nome} · {selected.transportadora}
            </p>
            <p className="text-xs text-slate-400">{formatPhone(selected.telefone)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {entryHasPrioridade(selected) && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  <Star className="h-3 w-3" />
                  Prioridade
                </span>
              )}
              {entryRetornoRacksVazios(selected) && <RacksVaziosBadge />}
            </div>
            <QueueEntryBadges entry={selected} showRacks={false} className="mt-2" />
          </div>
          {isEmpilhador && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {isAdmin && <QueueEntryDates entry={selected} />}

        {permissions.canSetPrioridade && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm">
            <input
              type="checkbox"
              checked={editPrioridade}
              disabled={saving || selected.prioridade_automatica}
              onChange={(e) => void savePrioridade(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <Star className="h-4 w-4 text-amber-600" />
            <span>
              {selected.prioridade_automatica
                ? "Prioridade automática (NF vence amanhã)"
                : "Prioridade manual na fila"}
            </span>
          </label>
        )}

        {permissions.canEditDoca && (isAdmin || selectedIsActive) && (
          <Input
            label="Doca"
            value={editDoca}
            onChange={(e) => setEditDoca(e.target.value)}
            placeholder="Ex: Doca 3"
          />
        )}

        {permissions.canChamarWhatsApp && selectedIsActive && (
          <Button
            variant="success"
            className="w-full"
            size="lg"
            disabled={saving}
            onClick={() => chamarParaDoca(selected)}
          >
            <MessageCircle className="h-4 w-4" />
            Chamar motorista (WhatsApp)
          </Button>
        )}

        {isEmpilhador && selectedIsActive && (
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={saving}
              onClick={() => applyStatus(selected.id, "ausente")}
            >
              <UserX className="h-4 w-4" />
              Motorista ausente
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={saving}
              onClick={() => applyStatus(selected.id, "finalizado")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar operação
            </Button>
          </div>
        )}

        {!selectedIsActive && (isAdmin || isEmpilhador) && (
          <Button
            variant="outline"
            className="w-full justify-start border-brand text-brand"
            disabled={saving}
            onClick={() =>
              applyStatus(selected.id, "aguardando_descarregamento", selected.status)
            }
          >
            <RotateCcw className="h-4 w-4" />
            Reativar na fila
          </Button>
        )}

        {isAdmin && statusOptions.length > 0 && (
          <Select
            label="Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as QueueStatus)}
            options={statusOptions}
          />
        )}

        {permissions.canEditPrevisao && isAdmin && (
          <div>
            <Input
              label={
                selected.previsao_automatica
                  ? "Previsão automática (capacidade)"
                  : "Previsão de descarga (data)"
              }
              type="date"
              value={editPrevisao}
              onChange={(e) => setEditPrevisao(e.target.value)}
            />
            {selected.previsao_automatica && (
              <p className="mt-1 text-xs text-sky-700">
                Calculada pelo volume da minuta e capacidade restante da expedição.
                Altere a data para definir manualmente.
              </p>
            )}
          </div>
        )}

        {permissions.canEditRetornoRacks && isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-sm">
            <input
              type="checkbox"
              checked={editRetornoRacks}
              disabled={saving}
              onChange={(e) => setEditRetornoRacks(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <PackageOpen className="h-4 w-4 text-teal-700" />
            Retorna com racks
          </label>
        )}

        {(isAdmin || (isEmpilhador && selectedIsActive)) && (
          <Button className="w-full" size="lg" onClick={handleUpdate} disabled={saving}>
            {saving ? <Spinner size="sm" /> : "Salvar alterações"}
          </Button>
        )}

        {isEmpilhador && !selectedIsActive && (
          <p className="rounded-xl bg-brand-muted p-3 text-xs leading-relaxed text-slate-600">
            Esta minuta foi encerrada. Use &quot;Reativar na fila&quot; se precisar
            desfazer e voltar ao aguardando descarregamento.
          </p>
        )}

        {isEmpilhador && selectedIsActive && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
            Minutas com badge de prioridade e previsões de descarga são definidas pelo
            administrador.
          </p>
        )}

        {isAdmin && (
          <p className="rounded-xl bg-brand-muted p-3 text-xs leading-relaxed text-slate-600">
            Você pode alterar status, prioridade, previsão (data) e retorno com racks.
          </p>
        )}
      </div>
    );
  }

  const queueContent = (
    <>
      {fetchError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar fila</p>
            <p>{fetchError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <div
            className={
              isEmpilhador
                ? "space-y-2 pb-36"
                : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]"
            }
          >
            <div className={isEmpilhador ? "space-y-2" : "space-y-4"}>
              {displayedEntries.length === 0 ? (
                <Card className="py-14 text-center">
                  <p className="section-eyebrow">Fila do dia</p>
                  <p className="mt-2 text-sm text-slate-500">
                  {isEmpilhador && empilhadorFilter === "finalizadas"
                    ? "Nenhuma minuta finalizada hoje."
                    : isEmpilhador && empilhadorFilter === "ausentes"
                      ? "Nenhuma minuta marcada como ausente hoje."
                      : "Nenhum veículo na fila hoje."}
                  </p>
                </Card>
              ) : isAdmin ? (
                <>
                  {adminActiveList.length > 0 &&
                    renderQueueList(adminActiveList, "admin", {
                      sectionLabel: showFinalizados ? "Ativos na fila" : undefined,
                    })}
                  {showFinalizados && adminClosedList.length > 0 &&
                    renderQueueList(adminClosedList, "admin", {
                      sectionLabel: "Finalizados / ausentes hoje",
                      startIndex: adminActiveList.length,
                    })}
                </>
              ) : (
                renderQueueList(displayedEntries, "mobile")
              )}
            </div>

            {!isEmpilhador && (
              <Card className="sticky top-28 h-fit overflow-hidden p-0">
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Gerenciar minuta
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selected
                      ? `Minuta ${selected.minuta || "—"} · ${selected.placa_cavalo || selected.placa}`
                      : "Selecione um veículo na fila ao lado"}
                  </p>
                </div>
                <div className="p-5">{renderEntryDetail()}</div>
              </Card>
            )}
          </div>

          {isEmpilhador && nextToCall && permissions.canChamarWhatsApp && !selected && empilhadorFilter === "ativas" && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-4 backdrop-blur-md safe-bottom">
              <div className="page-container">
                <Button
                  variant="success"
                  size="lg"
                  className="w-full shadow-lg"
                  disabled={saving}
                  onClick={() => {
                    selectEntry(nextToCall);
                    chamarParaDoca(nextToCall);
                  }}
                >
                  <Zap className="h-5 w-5" />
                  Chamar próximo · Minuta {nextToCall.minuta || "—"}
                </Button>
              </div>
            </div>
          )}

          {isEmpilhador && selected && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
                aria-label="Fechar painel"
                onClick={() => setSelectedId(null)}
              />
              <div className="animate-slide-up fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-[var(--shadow-elevated)] safe-bottom">
                <div className="sticky top-0 bg-white px-4 pb-2 pt-3">
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
                </div>
                <div className="page-container pb-6">{renderEntryDetail()}</div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );

  const empilhadorFilterLabels: Record<EmpilhadorFilter, string> = {
    ativas: "Ativas",
    finalizadas: "Finalizadas",
    ausentes: "Ausentes",
  };

  if (isEmpilhador) {
    return (
      <FieldStaffShell userName={profile.full_name}>
        <FieldStaffPageTitle
          title={permissions.panelTitle}
          subtitle={
            empilhadorFilter === "ativas"
              ? `${activeEntries.length} aguardando descarregamento`
              : `${displayedEntries.length} minuta(s) · ${empilhadorFilterLabels[empilhadorFilter].toLowerCase()}`
          }
        />

        {empilhadorFilter === "ativas" && (
          <QueueStatsBar
            waiting={waitingCount}
            called={calledCount}
            className="mb-4"
          />
        )}

        <div className="mb-4 flex rounded-xl border border-slate-200/90 bg-slate-100/80 p-1">
          {(["ativas", "finalizadas", "ausentes"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                setEmpilhadorFilter(filter);
                setSelectedId(null);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-xs font-semibold transition",
                empilhadorFilter === filter
                  ? "bg-white text-brand shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500"
              )}
            >
              {filter === "ativas" ? (
                <Filter className="h-3.5 w-3.5" />
              ) : filter === "finalizadas" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <UserX className="h-3.5 w-3.5" />
              )}
              {empilhadorFilterLabels[filter]}
            </button>
          ))}
        </div>

        {empilhadorFilter !== "ativas" && (
          <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Toque em uma minuta encerrada para reativar na fila, se necessário.
          </p>
        )}

        {queueContent}
      </FieldStaffShell>
    );
  }

  return (
    <AppShell role={appRole} userName={profile.full_name}>
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-eyebrow">Operação · Descarga</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {permissions.panelTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ordem por check-in e prioridade · atualização em tempo real
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nextToCall && permissions.canChamarWhatsApp && (
              <Button
                variant="success"
                disabled={saving}
                onClick={() => {
                  selectEntry(nextToCall);
                  chamarParaDoca(nextToCall);
                }}
              >
                <Zap className="h-4 w-4" />
                Chamar próximo (WhatsApp)
              </Button>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm">
              <input
                type="checkbox"
                checked={showFinalizados}
                onChange={(e) => {
                  setLoading(true);
                  setShowFinalizados(e.target.checked);
                }}
                className="rounded border-slate-300 text-brand focus:ring-brand"
              />
              Mostrar finalizados / ausentes de hoje
            </label>
          </div>
        </div>

        <QueueStatsBar
          waiting={waitingCount}
          called={calledCount}
          total={displayedEntries.length}
        />
      </div>
      {queueContent}
    </AppShell>
  );
}
