"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QueueEntry, QueueStatus, Profile } from "@/lib/types";
import { toAppRole } from "@/lib/types";
import {
  sortQueueEntries,
  isDriverCalled,
  isActiveQueueStatus,
  isAusenteQueueStatus,
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
import { getCallDriverWhatsAppLink, getEmpilhadorCallWhatsAppLink } from "@/lib/whatsapp";
import { formatPhone, isoToDateInput, getProfileDisplayName, cn } from "@/lib/utils";
import { sanitizeQueueEntries } from "@/lib/sanitize-queue-entry";
import { countAguardandoDescarregamento, countAusentes, countFinalizadasNoDiaOperacional, countStrictAguardandoDescarregamento, isFinalizadaNoDiaOperacional } from "@/lib/queue-counters";
import { createDebouncedFn } from "@/lib/debounce";
import { QueueEntryDates } from "@/components/fila/QueueEntryDates";
import { EmpilhadorQueueCard } from "@/components/fila/EmpilhadorQueueCard";
import { EmpilhadorQueueTabs } from "@/components/fila/EmpilhadorQueueTabs";
import { QueueAdminSummaryStrip } from "@/components/fila/QueueAdminSummaryStrip";
import { QueueMobileSummaryStrip } from "@/components/fila/QueueMobileSummaryStrip";
import { PanelPageTitle } from "@/components/brand/PanelShellHeader";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { AppShell } from "@/components/layout/AppShell";
import {
  FieldStaffShell,
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
  Clock,
} from "lucide-react";

type EmpilhadorFilter = "aguardando" | "finalizadas";

function sortClosedEntries(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.finished_at ?? b.updated_at ?? 0).getTime() -
      new Date(a.finished_at ?? a.updated_at ?? 0).getTime()
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
  const [empilhadorFilter, setEmpilhadorFilter] = useState<EmpilhadorFilter>("aguardando");

  const fetchQueue = useCallback(async () => {
      setFetchError(null);

      const needsFullDay = isAdmin || isEmpilhador;

      const params = new URLSearchParams();
      if (isAdmin) params.set("scope", "admin");
      else if (needsFullDay) params.set("scope", "all");
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

      setEntries(sortQueueEntries(sanitizeQueueEntries(json.data ?? [])));
      setLoading(false);
    },
    [isAdmin, isEmpilhador]
  );

  async function refreshAfterSave(statusChanged?: QueueStatus) {
    if (statusChanged === "finalizado") {
      setSelectedId(null);
      if ((isAdmin && showFinalizados) || (isEmpilhador && empilhadorFilter !== "aguardando")) {
        await fetchQueue();
        return;
      }
    }
    if (statusChanged === "ausente") {
      await fetchQueue();
      return;
    }
    if (statusChanged === "aguardando_descarregamento" && isEmpilhador) {
      setSelectedId(null);
      if (empilhadorFilter !== "aguardando") {
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

  const selected = useMemo(
    () => (selectedId ? entries.find((e) => e.id === selectedId) ?? null : null),
    [entries, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setEditPrioridade(entryHasPrioridade(selected));
    }
  }, [selected]);

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
      setSaving(false);
      alert("Use o botão WhatsApp para chamar o motorista ou altere o status.");
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

  async function chamarMotorista(entry: QueueEntry) {
    if (!permissions.canChamarWhatsApp) return;

    if (!entry.telefone?.replace(/\D/g, "").trim()) {
      alert("Telefone do motorista não disponível para WhatsApp.");
      return;
    }

    setSaving(true);

    const payload: {
      entryId: string;
      called_at: string;
      doca?: string | null;
      previsao_descarregamento?: string | null;
    } = {
      entryId: entry.id,
      called_at: new Date().toISOString(),
    };

    if (permissions.canEditDoca) {
      const doca = editDoca.trim() || entry.doca?.trim() || null;
      payload.doca = doca;
    }

    if (
      permissions.canEditPrevisao &&
      selectedId === entry.id &&
      isActiveQueueStatus(entry.status)
    ) {
      payload.previsao_descarregamento = editPrevisao ? editPrevisao : null;
    }

    const { error } = await updateQueueEntryViaApi(payload);

    setSaving(false);

    if (error) {
      alert(`Erro ao registrar chamada: ${error}`);
      return;
    }

    const minuta = entry.minuta || entry.placa;
    const link = permissions.canEditDoca
      ? getCallDriverWhatsAppLink(
          entry.telefone,
          minuta,
          payload.doca ?? entry.doca
        )
      : getEmpilhadorCallWhatsAppLink(entry.telefone, minuta);

    if (!link) {
      alert("Telefone do motorista inválido para WhatsApp.");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
    fetchQueue();
  }

  const activeEntries = entries.filter((e) => isActiveQueueStatus(e.status));
  const ausenteEntries = entries.filter((e) => isAusenteQueueStatus(e.status));
  const operationalEntries = [...activeEntries, ...ausenteEntries];
  const adminWaitingCount = countStrictAguardandoDescarregamento(entries);
  const adminAbsentCount = countAusentes(entries);
  const aguardandoCount = countAguardandoDescarregamento(entries);
  const finalizedTodayCount = countFinalizadasNoDiaOperacional(entries);

  const displayedEntries = useMemo(() => {
    if (!isEmpilhador) return entries;
    if (empilhadorFilter === "finalizadas") {
      return sortClosedEntries(entries.filter(isFinalizadaNoDiaOperacional));
    }
    return entries.filter(
      (e) => isActiveQueueStatus(e.status) || isAusenteQueueStatus(e.status)
    );
  }, [entries, isEmpilhador, empilhadorFilter]);

  const selectedIsActive = selected ? isActiveQueueStatus(selected.status) : false;
  const nextToCall = getNextToCall(activeEntries);
  const nextToCallId = nextToCall?.id ?? null;

  function renderQueueList(
    list: QueueEntry[],
    options?: { sectionLabel?: string; startIndex?: number; cardVariant?: "default" | "admin" }
  ) {
    const start = options?.startIndex ?? 0;
    const cardVariant = options?.cardVariant ?? (isAdmin ? "admin" : "default");

    return (
      <div className={cn("space-y-2", isAdmin && "space-y-2.5")}>
        {options?.sectionLabel && (
          <div
            className={cn(
              "flex items-baseline justify-between gap-2 px-0.5",
              isAdmin ? "pb-0.5 pt-3 first:pt-0" : "pt-1"
            )}
          >
            <p className="section-eyebrow">{options.sectionLabel}</p>
            <span className="text-[11px] font-medium tabular-nums text-slate-400">
              {list.length} {list.length === 1 ? "veículo" : "veículos"}
            </span>
          </div>
        )}
        {list.map((entry, idx) => (
          <EmpilhadorQueueCard
            key={entry.id}
            entry={entry}
            position={start + idx + 1}
            selected={selectedId === entry.id}
            isNext={entry.id === nextToCallId && isActiveQueueStatus(entry.status)}
            onClick={() => selectEntry(entry)}
            variant={cardVariant}
          />
        ))}
      </div>
    );
  }

  const adminOperationalList = isAdmin
    ? displayedEntries.filter(
        (e) => isActiveQueueStatus(e.status) || isAusenteQueueStatus(e.status)
      )
    : [];
  const adminClosedList = isAdmin
    ? sortClosedEntries(
        displayedEntries.filter(
          (e) => normalizeQueueStatus(e.status) === "finalizado"
        )
      )
    : [];
  const adminHasVisibleList =
    adminOperationalList.length > 0 ||
    showFinalizados;

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
      <div className={cn("space-y-4", isAdmin && "space-y-5")}>
        <section className={cn(isAdmin && "space-y-3")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-brand">{selected.minuta || "—"}</p>
              <p className="mt-1 font-mono text-base font-semibold text-slate-900">
                {selected.placa_cavalo || selected.placa}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {selected.nome || "—"}
                <span className="text-slate-400"> · </span>
                {selected.transportadora || "—"}
              </p>
              <p className="text-xs text-slate-400">{formatPhone(selected.telefone)}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
        </section>

        {isAdmin && (
          <section className="border-t border-slate-100 pt-4">
            <QueueEntryDates entry={selected} />
          </section>
        )}

        <section className={cn("space-y-3", isAdmin && "border-t border-slate-100 pt-4")}>
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
              onClick={() => chamarMotorista(selected)}
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
              {isAusenteQueueStatus(selected.status)
                ? "Motorista voltou — liberar descarregamento"
                : "Reativar na fila"}
            </Button>
          )}

          {isAusenteQueueStatus(selected.status) && isEmpilhador && (
            <p className="text-xs leading-relaxed text-slate-500">
              Ausente permanece no topo da fila até ser descarregado. Os demais passam
              enquanto ele não retorna.
            </p>
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
                    : "Previsão de descarregamento (data)"
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
        </section>

        {(isAdmin || (isEmpilhador && selectedIsActive)) && (
          <section className={cn("space-y-3", isAdmin && "border-t border-slate-100 pt-4")}>
            <Button className="w-full" size="lg" onClick={handleUpdate} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Salvar alterações"}
            </Button>

            {isAdmin && (
              <p className="rounded-xl bg-brand-muted/80 p-3 text-xs leading-relaxed text-slate-600">
                Você pode alterar status, prioridade, previsão (data) e retorno com racks.
              </p>
            )}
          </section>
        )}

        {isEmpilhador && !selectedIsActive && (
          <p className="rounded-xl bg-brand-muted p-3 text-xs leading-relaxed text-slate-600">
            Esta minuta foi encerrada. Use &quot;Reativar na fila&quot; se precisar
            desfazer e voltar ao aguardando descarregamento.
          </p>
        )}

        {isEmpilhador && selectedIsActive && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
            Minutas com badge de prioridade e previsões de descarregamento são definidas pelo
            administrador.
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
                ? "space-y-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
                : "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6"
            }
          >
            <div className={cn(isAdmin ? "space-y-4" : "space-y-2")}>
              {(isAdmin ? !adminHasVisibleList : displayedEntries.length === 0) ? (
                <Card className="py-14 text-center">
                  <p className="section-eyebrow">Fila do dia</p>
                  <p className="mt-2 text-sm text-slate-500">
                  {isEmpilhador && empilhadorFilter === "finalizadas"
                    ? "Nenhuma minuta encerrada hoje."
                    : "Nenhum veículo aguardando na fila."}
                  </p>
                </Card>
              ) : isAdmin ? (
                <div className="space-y-5">
                  {adminOperationalList.length > 0 &&
                    renderQueueList(adminOperationalList, {
                      sectionLabel: showFinalizados ? "Fila do pátio" : undefined,
                      cardVariant: "admin",
                    })}
                  {showFinalizados && adminClosedList.length > 0 &&
                    renderQueueList(adminClosedList, {
                      sectionLabel: "Finalizados",
                      startIndex: adminOperationalList.length,
                      cardVariant: "admin",
                    })}
                  {showFinalizados && adminClosedList.length === 0 && (
                    <Card className="py-8 text-center">
                      <p className="text-sm text-slate-500">
                        Nenhuma minuta finalizada no histórico carregado.
                      </p>
                    </Card>
                  )}
                </div>
              ) : (
                renderQueueList(displayedEntries)
              )}
            </div>

            {!isEmpilhador && (
              <Card className="sticky top-28 h-fit overflow-hidden border-brand/12 p-0 shadow-[var(--shadow-card)]">
                <div className="border-b border-brand/10 bg-brand-muted/40 px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Gerenciar minuta
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {selected ? (
                      <>
                        <span className="font-semibold text-brand">{selected.minuta || "—"}</span>
                        <span className="text-slate-400"> · </span>
                        <span className="font-mono text-slate-600">
                          {selected.placa_cavalo || selected.placa}
                        </span>
                      </>
                    ) : (
                      "Selecione um veículo na fila ao lado"
                    )}
                  </p>
                </div>
                <div className="p-5">{renderEntryDetail()}</div>
              </Card>
            )}
          </div>

          {isEmpilhador && nextToCall && permissions.canChamarWhatsApp && !selected && empilhadorFilter === "aguardando" && (
            <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgb(15_23_42/0.06)] backdrop-blur-sm">
                <Button
                  variant="success"
                  size="lg"
                  className="w-full shadow-md"
                  disabled={saving}
                  onClick={() => {
                    selectEntry(nextToCall);
                    chamarMotorista(nextToCall);
                  }}
                >
                  <Zap className="h-5 w-5" />
                  Chamar próximo · Minuta {nextToCall.minuta || "—"}
                </Button>
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

  if (isEmpilhador) {
    return (
      <FieldStaffShell
        userName={getProfileDisplayName(profile.full_name, profile.email)}
      >
        <PanelPageTitle
          title={permissions.panelTitle}
          subtitle={
            empilhadorFilter === "aguardando"
              ? `${operationalEntries.length} veículo${operationalEntries.length !== 1 ? "s" : ""} no pátio${ausenteEntries.length > 0 ? ` · ${ausenteEntries.length} ausente${ausenteEntries.length !== 1 ? "s" : ""}` : ""}`
              : `${displayedEntries.length} minuta${displayedEntries.length !== 1 ? "s" : ""} finalizada${displayedEntries.length !== 1 ? "s" : ""} hoje`
          }
        />

        <QueueMobileSummaryStrip
          waiting={aguardandoCount}
          finalized={finalizedTodayCount}
          className="mb-4"
        />

        <EmpilhadorQueueTabs
          className="mb-4"
          value={empilhadorFilter}
          onChange={(filter) => {
            setEmpilhadorFilter(filter);
            setSelectedId(null);
          }}
          tabs={[
            { id: "aguardando", label: "Aguardando", icon: Clock },
            { id: "finalizadas", label: "Finalizadas", icon: CheckCircle2 },
          ]}
        />

        {empilhadorFilter === "finalizadas" && (
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Minutas finalizadas hoje. Ausentes continuam na aba Aguardando até voltarem.
          </p>
        )}

        {queueContent}
      </FieldStaffShell>
    );
  }

  return (
    <AppShell
      role={appRole}
      userName={profile.full_name}
      userEmail={profile.email}
    >
      <AdminPageHeader
        eyebrow="Operação · Descarregamento"
        title={permissions.panelTitle}
        description="Ordem por check-in e prioridade · atualização em tempo real"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[15rem]">
          {nextToCall && permissions.canChamarWhatsApp && (
            <Button
              variant="success"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => {
                selectEntry(nextToCall);
                chamarMotorista(nextToCall);
              }}
            >
              <Zap className="h-4 w-4" />
              Chamar próximo (WhatsApp)
            </Button>
          )}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-brand/12 bg-white px-3.5 py-2.5 text-sm text-slate-600 shadow-[var(--shadow-card)]">
            <input
              type="checkbox"
              checked={showFinalizados}
              onChange={(e) => setShowFinalizados(e.target.checked)}
              className="rounded border-slate-300 text-brand focus:ring-brand/20"
            />
            Mostrar finalizados
          </label>
        </div>
      </AdminPageHeader>

      <QueueAdminSummaryStrip
        waiting={adminWaitingCount}
        finalized={finalizedTodayCount}
        absent={adminAbsentCount}
        className="mb-5"
      />
      {queueContent}
    </AppShell>
  );
}
