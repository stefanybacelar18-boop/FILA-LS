"use client";

import { useEffect, useState, useMemo } from "react";
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
import { isoToDateInput, getProfileDisplayName } from "@/lib/utils";
import {
  countAguardandoDescarregamento,
  countAusentes,
  countFinalizadasNoDiaOperacional,
  countStrictAguardandoDescarregamento,
  isFinalizadaNoDiaOperacional,
} from "@/lib/queue-counters";
import { useQueuePanelData } from "@/hooks/useQueuePanelData";
import { EmpilhadorQueueTabs } from "@/components/fila/EmpilhadorQueueTabs";
import { EmpilhadorQueueSummary } from "@/components/fila/EmpilhadorQueueSummary";
import { QueueAdminSummaryStrip } from "@/components/fila/QueueAdminSummaryStrip";
import { EstoqueCapacityGauge } from "@/components/fila/EstoqueCapacityGauge";
import { QueuePanelAlerts } from "@/components/fila/QueuePanelAlerts";
import { QueueCapacityAlertsBanner } from "@/components/fila/QueueCapacityAlertsBanner";
import { QueueEntryDetailPanel } from "@/components/fila/QueueEntryDetailPanel";
import { QueuePanelListSection } from "@/components/fila/QueuePanelListSection";
import { AdminPageHeader } from "@/components/layout/AdminPageHeader";
import { AppShell } from "@/components/layout/AppShell";
import { FieldStaffShell } from "@/components/layout/FieldStaffShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshIconButton } from "@/components/ui/RefreshIconButton";
import { CheckCircle2, Clock, Zap } from "lucide-react";

type EmpilhadorFilter = "aguardando" | "finalizadas";

export function QueuePanel({ profile }: { profile: Profile }) {
  const appRole = toAppRole(profile.role);
  const permissions = getQueuePermissions(profile.role);
  const statusOptions = statusOptionsForRole(profile.role);
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
  const [showFinalizados, setShowFinalizados] = useState(false);
  const [empilhadorFilter, setEmpilhadorFilter] = useState<EmpilhadorFilter>("aguardando");
  const [actionError, setActionError] = useState<string | null>(null);

  async function refreshAfterSave(statusChanged?: QueueStatus) {
    if (statusChanged === "finalizado") {
      setSelectedId(null);
      if ((isAdmin && showFinalizados) || (isEmpilhador && empilhadorFilter !== "aguardando")) {
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
  }

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
  }

  async function applyStatus(entryId: string, status: QueueStatus, fromStatus?: string) {
    if (!assertStatusAllowed(profile.role, status, fromStatus)) {
      setActionError("Seu perfil não pode alterar para este status.");
      return;
    }

    setSaving(true);
    const { error } = await updateQueueEntryViaApi({ entryId, status });

    setSaving(false);
    if (error) {
      setActionError(`Erro ao salvar: ${error}`);
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
      setActionError("Use o botão WhatsApp para chamar o motorista ou altere o status.");
      return;
    }

    if (!assertStatusAllowed(profile.role, editStatus, entry.status)) {
      setSaving(false);
      setActionError("Status não permitido para seu perfil.");
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
      setActionError(`Erro ao salvar: ${statusError}`);
      return;
    }
    await refreshAfterSave(editStatus);
  }

  async function chamarMotorista(entry: QueueEntry) {
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

    const { error } = await updateQueueEntryViaApi(payload);

    setSaving(false);

    if (error) {
      setActionError(`Erro ao registrar chamada: ${error}`);
      return;
    }

    const minuta = entry.minuta || entry.placa;
    const link = permissions.canEditDoca
      ? getCallDriverWhatsAppLink(entry.telefone, minuta, payload.doca ?? entry.doca)
      : getEmpilhadorCallWhatsAppLink(entry.telefone, minuta);

    if (!link) {
      setActionError("Telefone do motorista inválido para WhatsApp.");
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

  const capacityAlerts = useMemo(
    () =>
      activeEntries.filter(
        (e) => Boolean(e.capacidade_aviso) && (e.volume_motos ?? 0) > 0
      ),
    [activeEntries]
  );

  const adminOperationalList = isAdmin
    ? displayedEntries.filter(
        (e) => isActiveQueueStatus(e.status) || isAusenteQueueStatus(e.status)
      )
    : [];
  const adminClosedList = isAdmin
    ? sortClosedEntries(
        displayedEntries.filter((e) => normalizeQueueStatus(e.status) === "finalizado")
      )
    : [];
  const adminHasVisibleList =
    adminOperationalList.length > 0 || showFinalizados;

  const entryDetailProps = {
    selected,
    permissions,
    isAdmin,
    isEmpilhador,
    selectedIsActive,
    editPrioridade,
    editDoca,
    editStatus,
    editPrevisao,
    editRetornoRacks,
    saving,
    statusOptions,
    onClose: isEmpilhador ? () => setSelectedId(null) : undefined,
    onEditDoca: setEditDoca,
    onEditStatus: setEditStatus,
    onEditPrevisao: setEditPrevisao,
    onEditRetornoRacks: setEditRetornoRacks,
    onSavePrioridade: (checked: boolean) => void savePrioridade(checked),
    onChamarMotorista: (entry: QueueEntry) => void chamarMotorista(entry),
    onApplyStatus: (entryId: string, status: QueueStatus, fromStatus?: string) =>
      void applyStatus(entryId, status, fromStatus),
    onSave: () => void handleUpdate(),
  };

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
                ? "space-y-2 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
                : "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6"
            }
          >
            <div className={isAdmin ? "space-y-4" : "space-y-2"}>
              {capacityAlerts.length > 0 &&
                (isAdmin || isEmpilhador) &&
                empilhadorFilter === "aguardando" && (
                  <QueueCapacityAlertsBanner entries={capacityAlerts} />
                )}
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
                  {adminOperationalList.length > 0 && (
                    <QueuePanelListSection
                      list={adminOperationalList}
                      selectedId={selectedId}
                      nextToCallId={nextToCallId}
                      isAdmin={isAdmin}
                      onSelect={selectEntry}
                      sectionLabel={showFinalizados ? "Fila do pátio" : undefined}
                      cardVariant="admin"
                    />
                  )}
                  {showFinalizados && adminClosedList.length > 0 && (
                    <QueuePanelListSection
                      list={adminClosedList}
                      selectedId={selectedId}
                      nextToCallId={nextToCallId}
                      isAdmin={isAdmin}
                      onSelect={selectEntry}
                      sectionLabel="Finalizados"
                      startIndex={adminOperationalList.length}
                      cardVariant="admin"
                    />
                  )}
                  {showFinalizados && adminClosedList.length === 0 && (
                    <Card className="py-8 text-center">
                      <p className="text-sm text-slate-500">
                        Nenhuma minuta finalizada no histórico carregado.
                      </p>
                    </Card>
                  )}
                </div>
              ) : (
                <QueuePanelListSection
                  list={displayedEntries}
                  selectedId={selectedId}
                  nextToCallId={nextToCallId}
                  isAdmin={isAdmin}
                  onSelect={selectEntry}
                />
              )}
            </div>

            {!isEmpilhador && (
              <Card className="sticky top-28 h-fit overflow-hidden border-brand/12 p-0 shadow-[var(--shadow-card)]">
                <div className="border-b border-brand/10 bg-brand-muted/40 px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">Gerenciar minuta</h2>
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
                <div className="p-5">
                  <QueueEntryDetailPanel {...entryDetailProps} />
                </div>
              </Card>
            )}
          </div>

          {isEmpilhador &&
            nextToCall &&
            permissions.canChamarWhatsApp &&
            !selected &&
            empilhadorFilter === "aguardando" && (
              <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] z-40 px-4 py-3">
                <Button
                  variant="success"
                  size="lg"
                  className="w-full rounded-xl shadow-lg"
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
                <div className="page-container pb-6">
                  <QueueEntryDetailPanel {...entryDetailProps} />
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
          nextMinuta={nextToCall?.minuta}
          estoqueSummary={estoqueSummary}
          trailing={
            <RefreshIconButton
              onRefresh={() => fetchQueue(true)}
              label="Atualizar fila"
            />
          }
          tabsSlot={
            <EmpilhadorQueueTabs
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
          }
        />

        {queueContent}
      </FieldStaffShell>
    );
  }

  return (
    <AppShell role={appRole} userName={profile.full_name} userEmail={profile.email}>
      <AdminPageHeader
        eyebrow="Operação · Descarregamento"
        title={permissions.panelTitle}
        description="Ordem por check-in e prioridade · atualização em tempo real"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[15rem]">
          <RefreshIconButton
            onRefresh={() => fetchQueue(true)}
            label="Atualizar fila"
            className="self-end sm:self-auto"
          />
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
        className="mb-3"
      />

      <EstoqueCapacityGauge summary={estoqueSummary} className="mb-5" />

      {queueContent}
    </AppShell>
  );
}
