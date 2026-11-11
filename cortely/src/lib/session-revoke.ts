/**
 * Revogação de sessões staff (demo + bridge até Supabase Auth).
 * Persistido em memória do processo; em multi-instância usar tabela SQL.
 */

export type StaffRevocation = {
  staffId: string;
  barbershopId: string;
  reason: string;
  revokedAt: number;
  actorId?: string;
};

type RevocationState = {
  byStaffId: Map<string, StaffRevocation>;
  audit: Array<{
    id: string;
    at: number;
    actorId: string | null;
    barbershopId: string;
    action: string;
    detail: string;
  }>;
};

const globalRevoke = globalThis as typeof globalThis & {
  __cortelySessionRevokeV1?: RevocationState;
};

function state(): RevocationState {
  if (!globalRevoke.__cortelySessionRevokeV1) {
    globalRevoke.__cortelySessionRevokeV1 = {
      byStaffId: new Map(),
      audit: [],
    };
  }
  return globalRevoke.__cortelySessionRevokeV1;
}

export function revokeStaffSessions(input: {
  staffId: string;
  barbershopId: string;
  reason: string;
  actorId?: string;
}) {
  const row: StaffRevocation = {
    staffId: input.staffId,
    barbershopId: input.barbershopId,
    reason: input.reason,
    revokedAt: Date.now(),
    actorId: input.actorId,
  };
  state().byStaffId.set(input.staffId, row);
  state().audit.unshift({
    id: `${Date.now()}-${input.staffId}`,
    at: row.revokedAt,
    actorId: input.actorId ?? null,
    barbershopId: input.barbershopId,
    action: "staff.session_revoke",
    detail: `${input.reason} · staff=${input.staffId}`,
  });
  // Mantém últimas 200 entradas
  if (state().audit.length > 200) state().audit.length = 200;
  return row;
}

export function clearStaffRevocation(staffId: string) {
  state().byStaffId.delete(staffId);
}

export function isStaffSessionRevoked(staffId: string) {
  return state().byStaffId.has(staffId);
}

export function listPermissionAudit(barbershopId?: string) {
  const rows = state().audit;
  if (!barbershopId) return rows.slice(0, 50);
  return rows.filter((r) => r.barbershopId === barbershopId).slice(0, 50);
}

export function auditPermissionChange(input: {
  actorId: string | null;
  barbershopId: string;
  action: string;
  detail: string;
}) {
  state().audit.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    actorId: input.actorId,
    barbershopId: input.barbershopId,
    action: input.action,
    detail: input.detail,
  });
}
