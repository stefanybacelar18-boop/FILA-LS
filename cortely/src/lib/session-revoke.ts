/**
 * Revogação de sessões staff.
 * Memória do processo (demo / single-instance) + tabela SQL quando Supabase ativo.
 */

import { createServiceClient, isDemoMode } from "@/lib/supabase/env";

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

function persistRevocation(row: StaffRevocation) {
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    void supabase.from("staff_session_revocations").upsert({
      staff_id: row.staffId,
      barbershop_id: row.barbershopId,
      reason: row.reason,
      actor_id: row.actorId ?? null,
      revoked_at: new Date(row.revokedAt).toISOString(),
    });
    void supabase.from("permission_audit_log").insert({
      barbershop_id: row.barbershopId,
      actor_id: row.actorId ?? null,
      action: "staff.session_revoke",
      detail: `${row.reason} · staff=${row.staffId}`,
    });
  } catch {
    /* fail-open on persist write would be unsafe; memory still holds */
  }
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
  if (state().audit.length > 200) state().audit.length = 200;
  persistRevocation(row);
  return row;
}

export function clearStaffRevocation(staffId: string) {
  state().byStaffId.delete(staffId);
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    void supabase.from("staff_session_revocations").delete().eq("staff_id", staffId);
  } catch {
    /* ignore */
  }
}

export function isStaffSessionRevoked(staffId: string) {
  return state().byStaffId.has(staffId);
}

export function getStaffRevokedAt(staffId: string): number | null {
  return state().byStaffId.get(staffId)?.revokedAt ?? null;
}

/**
 * Revogação por marco temporal: tokens com iat < revoked_at são rejeitados.
 * Login novo (iat >= revoked_at) funciona sem limpar o registro de auditoria.
 * Fail-closed em produção se o DB estiver inacessível.
 */
export async function isStaffSessionRevokedDurable(
  staffId: string,
  tokenIatMs?: number,
): Promise<boolean> {
  const memAt = getStaffRevokedAt(staffId);
  if (memAt != null) {
    if (tokenIatMs != null && tokenIatMs >= memAt) return false;
    return true;
  }
  if (isDemoMode()) return false;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("staff_session_revocations")
      .select("staff_id, revoked_at")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (error) return true;
    if (!data) return false;
    const revokedAt = new Date(data.revoked_at).getTime();
    state().byStaffId.set(staffId, {
      staffId,
      barbershopId: "",
      reason: "durable",
      revokedAt,
    });
    if (tokenIatMs != null && tokenIatMs >= revokedAt) return false;
    return true;
  } catch {
    return true;
  }
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
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    void supabase.from("permission_audit_log").insert({
      barbershop_id: input.barbershopId,
      actor_id: input.actorId,
      action: input.action,
      detail: input.detail,
    });
  } catch {
    /* ignore */
  }
}
