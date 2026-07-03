import type { QueueStatus } from "./types";
import { toAppRole } from "./types";
import { normalizeQueueStatus, QUEUE_STATUSES, STATUS_LABELS } from "./constants";

export interface QueuePermissions {
  panelTitle: string;
  panelSubtitle: string;
  canEditDoca: boolean;
  canEditPrevisao: boolean;
  canChamarWhatsApp: boolean;
  canSetPrioridade: boolean;
  canEditRetornoRacks: boolean;
  editableStatuses: QueueStatus[];
}

export function isStaffQueueRole(role: string): boolean {
  const app = toAppRole(role);
  return app === "empilhador" || app === "administrador";
}

export function getQueuePermissions(role: string): QueuePermissions {
  const appRole = toAppRole(role);

  if (appRole === "administrador") {
    return {
      panelTitle: "Fila de descarga",
      panelSubtitle: "Controle total: status, docas, prioridade, previsões e WhatsApp",
      canEditDoca: true,
      canEditPrevisao: true,
      canChamarWhatsApp: true,
      canSetPrioridade: true,
      canEditRetornoRacks: true,
      editableStatuses: [...QUEUE_STATUSES],
    };
  }

  return {
    panelTitle: "Fila do pátio",
    panelSubtitle: "Chame motoristas, docas e ordem da fila",
    canEditDoca: true,
    canEditPrevisao: false,
    canChamarWhatsApp: true,
    canSetPrioridade: false,
    canEditRetornoRacks: false,
    editableStatuses: ["ausente", "finalizado"],
  };
}

export function statusOptionsForRole(role: string): { value: string; label: string }[] {
  return getQueuePermissions(role).editableStatuses.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  }));
}

export function canAccessHistorico(role: string): boolean {
  return canAccessAdmin(role);
}

export function canAccessCheckinsRegistry(role: string): boolean {
  return canAccessAdmin(role);
}

export function canAccessDashboard(role: string): boolean {
  return isStaffQueueRole(role);
}

export function canAccessAdmin(role: string): boolean {
  return toAppRole(role) === "administrador";
}

export function assertStatusAllowed(
  role: string,
  status: QueueStatus,
  fromStatus?: string
): boolean {
  const perms = getQueuePermissions(role);
  if (perms.editableStatuses.includes(status)) return true;

  const from = fromStatus ? normalizeQueueStatus(fromStatus) : null;
  if (
    toAppRole(role) === "empilhador" &&
    status === "aguardando_descarregamento" &&
    (from === "ausente" || from === "finalizado")
  ) {
    return true;
  }

  return false;
}

/** Rota após login staff */
export function staffHomePath(role: string): string {
  return toAppRole(role) === "administrador" ? "/admin" : "/empilhador";
}
