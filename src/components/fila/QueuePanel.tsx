"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { QueueEntry, QueueStatus, Profile } from "@/lib/types";
import { toAppRole } from "@/lib/types";
import {
  sortQueueEntries,
  isActiveQueueStatus,
  isAusenteQueueStatus,
  normalizeQueueStatus,
  getNextToCall,
} from "@/lib/queue";
import { sortClosedEntries } from "@/lib/queue-closed-sort";
import { updateQueueEntryViaApi } from "@/lib/queue-api";
import { entryHasPrioridade } from "@/lib/queue-priorities";
import { entryRetornoRacksVazios } from "@/lib/queue-badges";
import {
  getQueuePermissions,
  statusOptionsForRole,
  assertStatusAllowed,
} from "@/lib/role-permissions";
import { getCallDriverWhatsAppLink, getEmpilhadorCallWhatsAppLink } from "@/lib/whatsapp";
import { isoToDateInput, getProfileDisplayName, cn } from "@/lib/utils";
import {
  countAguardandoDescarregamento,
  countFinalizadasNoDiaOperacional,
  countStrictAguardandoDescarregamento,
  isFinalizadaNoDiaOperacional,
} from "@/lib/queue-counters";
import { useQueuePanelData } from "@/hooks/useQueuePanelData";
import { EmpilhadorQueueSummary } from "@/components/fila/EmpilhadorQueueSummary";
import { EmpilhadorQueueList } from "@/components/fila/EmpilhadorQueueList";
import { EmpilhadorMinutaSheet } from "@/components/fila/EmpilhadorMinutaSheet";
import { AdminQueueActionBar } from "@/components/fila/AdminQueueActionBar";
import { QueueCapacityAlertsBanner } from "@/components/fila/QueueCapacityAlertsBanner";
import { QueuePanelAlerts } from "@/components/fila/QueuePanelAlerts";
import { AdminMinutaDetailPanel } from "@/components/fila/AdminMinutaDetailPanel";
import { AdminQueueList } from "@/components/fila/AdminQueueList";
import { AppShell } from "@/components/layout/AppShell";
import { FieldStaffShell } from "@/components/layout/FieldStaffShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { Zap } from "lucide-react";

type EmpilhadorFilter = "aguardando" | "finalizadas";
type AdminQueueFilter = "ativos" | "finalizados";

export function QueuePanel({ profile }: { profile: Profile }) {
  const appRole = toAppRole(profile.role);
  const permissions = useMemo(() => getQueuePermissions(profile.role), [profile.role]);
  const statusOptions = useMemo(() => statusOptionsForRole(profile.role), [profile.role]);
  const isEmpilhador = appRole === "empilhador";
  const isAdmin = appRole === "administrador";

  const { entries, setEntries, loading, fetchError, estoqueSummary, fetchQueue } =
    useQueuePanelData({
      role: profile.role,
      isAdmin,
      isEmpilhador,
    });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<QueueStatus>("aguardando_descarregamento");
  const [editDoca, setEditDoca] = useState("");
  const [editPrevisao, setEditPrevisao] = useState("");
  const [editRetornoRacks, setEditRetornoRacks] = useState(false);
  const [editPrioridade, setEditPrioridade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminFilter, setAdminFilter] = useState<AdminQueueFilter>("ativos");
  const [empilhadorFilter, setEmpilhadorFilter] = useState<EmpilhadorFilter>("aguardando");
  const [minutaSearch, setMinutaSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const patchEntry = useCallback(
    (entryId: string, data: QueueEntry) => {
      setEntries((prev) =>
        sortQueueEntries(prev.map((e) => (e.id === entryId ? { ...e, ...data } : e)))
      );
    },
    [setEntries]
  );

  const refreshAfterSave = useCallback(
    async (statusChanged?: QueueStatus) => {
      if (statusChanged === "finalizado") {
        setSelectedId(null);
        if (
          (isAdmin && adminFilter === "finalizados") ||
          (isEmpilhador && empilhadorFilter !== "aguardando")
        ) {
          await fetchQueue(true);
          return;
        }
      }
      if (statusChanged === "ausente") {
        await fetchQueue(true);
        return;
      }
      if (statusChanged === "aguardando_descarregamento" && isEmpilhador) {
        setSelectedId(null);
        if (empilhadorFilter !== "aguardando") {
          await fetchQueue(true);
          return;
        }
      }
      await fetchQueue(true);
    },
    [adminFilter, empilhadorFilter, fetchQueue, isAdmin, isEmpilhador]
  );

  const selected = useMemo(
    () => (selectedId ? entries.find((e) => e.id === selectedId) ?? null : null),
    [entries, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setEditPrioridade(entryHasPrioridade(selected));
    }
  }, [selected]);

  const selectEntry = useCallback(
    (entry: QueueEntry) => {
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
    },
    [permissions.editableStatuses]
  );

  const savePrioridade = useCallback(
    async (checked: boolean) => {
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
        setActionError(`Erro ao salvar prioridade: ${error}`);
        return;
      }

      const saved = data ? entryHasPrioridade(data) : checked;
      setEditPrioridade(saved);

      if (data) {
        setEntries((prev) =>
          sortQueueEntries(
            prev.map((e) =>
              e.id === selectedId
                ? {
                    ...e,
                    ...data,
                    prioridade: saved,
                    prioridade_automatica_dispensada:
                      Boolean(e.prioridade_automatica) && !saved,
                  }
                : e
            )
          )
        );
      }
    },
    [editPrioridade, permissions.canSetPrioridade, selectedId, setEntries]
  );

  const applyStatus = useCallback(
    async (entryId: string, status: QueueStatus, fromStatus?: string) => {
      if (!assertStatusAllowed(profile.role, status, fromStatus)) {
        setActionError("Seu perfil não pode alterar para este status.");
        return;
      }

      setSaving(true);
      const { error, data } = await updateQueueEntryViaApi({ entryId, status });

      setSaving(false);
      if (error) {
        setActionError(`Erro ao salvar: ${error}`);
        return;
      }
      if (data) patchEntry(entryId, data);
      await refreshAfterSave(status);
    },
    [patchEntry, profile.role, refreshAfterSave]
  );

  const handleUpdate = useCallback(async () => {
    if (!selectedId) return;
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) return;

    setSaving(true);

    if (isEmpilhador && isActiveQueueStatus(entry.status)) {
      setSaving(false);
      setActionError("Use o botão WhatsApp para chamar o motorista ou altere o status.");
      return;
    }

    if (!assertStatusAllowed(profile.role, editStatus, entry.status)) {
      setSaving(false);
      setActionError("Status não permitido para seu perfil.");
      return;
    }

    const statusChanged = normalizeQueueStatus(entry.status) !== editStatus;

    const { error: statusError, data } = await updateQueueEntryViaApi({
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
      setActionError(`Erro ao salvar: ${statusError}`);
      return;
    }
    if (data) patchEntry(selectedId, data);
    await refreshAfterSave(editStatus);
  }, [
    editDoca,
    editPrevisao,
    editPrioridade,
    editRetornoRacks,
    editStatus,
    entries,
    isEmpilhador,
    patchEntry,
    permissions.canEditDoca,
    permissions.canEditPrevisao,
    permissions.canEditRetornoRacks,
    permissions.canSetPrioridade,
    profile.role,
    refreshAfterSave,
    selectedId,
  ]);

  const chamarMotorista = useCallback(
    async (entry: QueueEntry) => {
      if (!permissions.canChamarWhatsApp) return;

      if (!entry.telefone?.replace(/\D/g, "").trim()) {
        setActionError("Telefone do motorista não disponível para WhatsApp.");
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

      const { error, data } = await updateQueueEntryViaApi(payload);

      setSaving(false);

      if (error) {
        setActionError(`Erro ao registrar chamada: ${error}`);
        return;
      }

      if (data) patchEntry(entry.id, data);

      const minuta = entry.minuta || entry.placa;
      const link = permissions.canEditDoca
        ? getCallDriverWhatsAppLink(entry.telefone, minuta, payload.doca ?? entry.doca)
        : getEmpilhadorCallWhatsAppLink(entry.telefone, minuta);

      if (!link) {
        setActionError("Telefone do motorista inválido para WhatsApp.");
        return;
      }

      window.open(link, "_blank", "noopener,noreferrer");
    },
    [
      editDoca,
      editPrevisao,
      patchEntry,
      permissions.canChamarWhatsApp,
      permissions.canEditDoca,
      permissions.canEditPrevisao,
      selectedId,
    ]
  );

  const activeEntries = useMemo(
    () => entries.filter((e) => isActiveQueueStatus(e.status)),
    [entries]
  );
  const ausenteEntries = useMemo(
    () => entries.filter((e) => isAusenteQueueStatus(e.status)),
    [entries]
  );
  const operationalEntries = useMemo(
    () => [...activeEntries, ...ausenteEntries],
    [activeEntries, ausenteEntries]
  );
  const adminWaitingCount = useMemo(
    () => countStrictAguardandoDescarregamento(entries),
    [entries]
  );
  const aguardandoCount = useMemo(
    () => countAguardandoDescarregamento(entries),
    [entries]
  );
  const finalizedTodayCount = useMemo(
    () => countFinalizadasNoDiaOperacional(entries),
    [entries]
  );

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

  const showEmpilhadorCta =
    isEmpilhador &&
    Boolean(nextToCall) &&
    permissions.canChamarWhatsApp &&
    !selected &&
    empilhadorFilter === "aguardando";

  const capacityAlerts = useMemo(
    () =>
      activeEntries.filter(
        (e) => Boolean(e.capacidade_aviso) && (e.volume_motos ?? 0) > 0
      ),
    [activeEntries]
  );

  const adminOperationalList = useMemo(
    () =>
      isAdmin
        ? displayedEntries.filter(
            (e) => isActiveQueueStatus(e.status) || isAusenteQueueStatus(e.status)
          )
        : [],
    [displayedEntries, isAdmin]
  );
  const adminClosedList = useMemo(
    () =>
      isAdmin
        ? sortClosedEntries(
            displayedEntries.filter((e) => normalizeQueueStatus(e.status) === "finalizado")
          )
        : [],
    [displayedEntries, isAdmin]
  );

  const handleEmpilhadorFilterChange = useCallback((filter: EmpilhadorFilter) => {
    setEmpilhadorFilter(filter);
    setSelectedId(null);
    setMinutaSearch("");
  }, []);

  const handleAdminFilterChange = useCallback((filter: AdminQueueFilter) => {
    setAdminFilter(filter);
    setSelectedId(null);
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchQueue(true);
  }, [fetchQueue]);

  const adminDetailProps = useMemo(
    () => ({
      selected,
      permissions,
      selectedIsActive,
      editPrioridade,
      editStatus,
      editPrevisao,
      editRetornoRacks,
      saving,
      statusOptions,
      onEditStatus: setEditStatus,
      onEditPrevisao: setEditPrevisao,
      onEditRetornoRacks: setEditRetornoRacks,
      onSavePrioridade: savePrioridade,
      onChamarMotorista: chamarMotorista,
      onApplyStatus: applyStatus,
      onSave: handleUpdate,
    }),
    [
      selected,
      permissions,
      selectedIsActive,
      editPrioridade,
      editStatus,
      editPrevisao,
      editRetornoRacks,
      saving,
      statusOptions,
      savePrioridade,
      chamarMotorista,
      applyStatus,
      handleUpdate,
    ]
  );

  const queueContent = (
    <>
      <QueuePanelAlerts
        fetchError={fetchError}
        actionError={actionError}
        onDismissActionError={() => setActionError(null)}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando fila…" />
        </div>
      ) : (
        <>
          <div
            className={
              isEmpilhador
                ? cn(
                    "space-y-2",
                    showEmpilhadorCta && "pb-[var(--mobile-queue-cta-height)]"
                  )
                : "admin-queue-layout grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)] 2xl:grid-cols-[minmax(0,1fr)_36rem]"
            }
          >
            <div className={isAdmin ? "space-y-4" : "space-y-2"}>
              {capacityAlerts.length > 0 &&
                (isAdmin
                  ? adminFilter === "ativos"
                  : isEmpilhador && empilhadorFilter === "aguardando") && (
                  <QueueCapacityAlertsBanner entries={capacityAlerts} />
                )}
              {isAdmin ? (
                <AdminQueueList
                  operationalList={adminOperationalList}
                  closedList={adminClosedList}
                  filter={adminFilter}
                  selectedId={selectedId}
                  nextToCallId={nextToCallId}
                  searchQuery={minutaSearch}
                  onSelect={selectEntry}
                />
              ) : (
                <EmpilhadorQueueList
                  entries={displayedEntries}
                  selectedId={selectedId}
                  nextToCallId={nextToCallId}
                  searchQuery={minutaSearch}
                  onSearchChange={setMinutaSearch}
                  onSelect={selectEntry}
                />
              )}
            </div>

            {!isEmpilhador && (
              <Card className="admin-detail-shell sticky top-24 flex max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden p-0">
                <div className="admin-detail-shell__header shrink-0">
                  <h2 className="text-sm font-semibold text-slate-900">Detalhes da minuta</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selected ? selected.minuta || "—" : "Selecione um item na fila"}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
                  <AdminMinutaDetailPanel {...adminDetailProps} />
                </div>
              </Card>
            )}
          </div>

          {showEmpilhadorCta && nextToCall && (
              <div className="mobile-queue-cta-bar">
                <Button
                  variant="success"
                  size="lg"
                  className="w-full rounded-xl shadow-md"
                  disabled={saving}
                  onClick={() => chamarMotorista(nextToCall)}
                >
                  <Zap className="h-5 w-5" />
                  Chamar próximo
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
              <div className="animate-slide-up fixed inset-x-0 bottom-[var(--mobile-bottom-nav-clearance)] z-[60] max-h-[min(88vh,calc(100dvh-var(--mobile-bottom-nav-clearance)))] overflow-y-auto rounded-t-2xl bg-white shadow-[var(--shadow-elevated)]">
                <div className="sticky top-0 z-10 bg-white px-4 pb-1 pt-3">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
                </div>
                <div className="page-container pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-1">
                  <EmpilhadorMinutaSheet
                    entry={selected}
                    saving={saving}
                    canChamarWhatsApp={permissions.canChamarWhatsApp}
                    onClose={() => setSelectedId(null)}
                    onChamarMotorista={chamarMotorista}
                    onApplyStatus={(entryId, status, fromStatus) =>
                      void applyStatus(entryId, status, fromStatus)
                    }
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );

  if (isEmpilhador) {
    return (
      <FieldStaffShell userName={getProfileDisplayName(profile.full_name, profile.email)}>
        <EmpilhadorQueueSummary
          filter={empilhadorFilter}
          aguardandoCount={aguardandoCount}
          operationalCount={operationalEntries.length}
          finalizedCount={finalizedTodayCount}
          absentCount={ausenteEntries.length}
          estoqueSummary={estoqueSummary}
          onFilterChange={handleEmpilhadorFilterChange}
          trailing={
            <RefreshIconButton
              onRefresh={handleRefresh}
              label="Atualizar fila"
            />
          }
        />

        {queueContent}
      </FieldStaffShell>
    );
  }

  return (
    <AppShell role={appRole} userName={profile.full_name} userEmail={profile.email}>
      <AdminQueueActionBar
        searchQuery={minutaSearch}
        onSearchChange={setMinutaSearch}
        onRefresh={handleRefresh}
        filter={adminFilter}
        onFilterChange={handleAdminFilterChange}
        aguardandoCount={adminWaitingCount}
        finalizedCount={finalizedTodayCount}
        showChamarProximo={
          Boolean(nextToCall && permissions.canChamarWhatsApp && adminFilter === "ativos")
        }
        onChamarProximo={
          nextToCall ? () => chamarMotorista(nextToCall) : undefined
        }
        saving={saving}
        className="mb-5"
      />

      {queueContent}
    </AppShell>
  );
}
