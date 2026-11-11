/**
 * Revogação de sessões staff.
 * Gate principal: incremento de `session_generation` (ver session-epoch.ts).
 */

import { createServiceClient, isDemoMode } from "@/lib/supabase/env";

export type StaffRevocation = {
  staffId: string;
  barbershopId: string;
  reason: string;
  revokedAt: number;
  actorId?: string;
  newGeneration?: number;
};

type RevocationState = {
  byStaffId: Map<string, StaffRevocation>;
  generationByStaffId: Map<string, number>;
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
  __cortelySessionRevokeV2?: RevocationState;
};

function state(): RevocationState {
  if (!globalRevoke.__cortelySessionRevokeV2) {
    globalRevoke.__cortelySessionRevokeV2 = {
      byStaffId: new Map(),
      generationByStaffId: new Map(),
      audit: [],
    };
  }
  return globalRevoke.__cortelySessionRevokeV2;
}

function bumpDemoGeneration(staffId: string): number {
  // Import dinâmico sincronicamente via cache do módulo (evita ciclo no top-level).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/lib/demo-store") as typeof import("@/lib/demo-store");
  const next = mod.demoStore.bumpSessionGeneration(staffId);
  state().generationByStaffId.set(staffId, next);
  return next;
}

async function bumpProdGeneration(staffId: string, barbershopId: string) {
  const supabase = createServiceClient();
  const { data: current } = await supabase
    .from("profiles")
    .select("session_generation")
    .eq("id", staffId)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();
  const next = (current?.session_generation ?? 1) + 1;
  await supabase
    .from("profiles")
    .update({ session_generation: next })
    .eq("id", staffId)
    .eq("barbershop_id", barbershopId);
  state().generationByStaffId.set(staffId, next);
  return next;
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
      detail: `${row.reason} · staff=${row.staffId} · sg=${row.newGeneration ?? "?"}`,
    });
  } catch {
    /* generation local ainda aplica o gate */
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

  if (isDemoMode()) {
    row.newGeneration = bumpDemoGeneration(input.staffId);
  } else {
    // Fire-and-forget bump + signOut global; callers críticos: revokeStaffSessionsAsync
    void bumpProdGeneration(input.staffId, input.barbershopId)
      .then(async (gen) => {
        row.newGeneration = gen;
        persistRevocation(row);
        try {
          const supabase = createServiceClient();
          await supabase.auth.admin.signOut(input.staffId, "global");
        } catch {
          /* proof HMAC + sg já bloqueiam tokens residuais */
        }
      })
      .catch(() => {
        const fallback = (state().generationByStaffId.get(input.staffId) ?? 1) + 1;
        state().generationByStaffId.set(input.staffId, fallback);
        row.newGeneration = fallback;
        persistRevocation(row);
      });
  }

  state().byStaffId.set(input.staffId, row);
  state().audit.unshift({
    id: `${Date.now()}-${input.staffId}`,
    at: row.revokedAt,
    actorId: input.actorId ?? null,
    barbershopId: input.barbershopId,
    action: "staff.session_revoke",
    detail: `${input.reason} · staff=${input.staffId} · sg=${row.newGeneration ?? "pending"}`,
  });
  if (state().audit.length > 200) state().audit.length = 200;
  if (isDemoMode()) persistRevocation(row);
  return row;
}

export async function revokeStaffSessionsAsync(input: {
  staffId: string;
  barbershopId: string;
  reason: string;
  actorId?: string;
}) {
  const gen = isDemoMode()
    ? bumpDemoGeneration(input.staffId)
    : await bumpProdGeneration(input.staffId, input.barbershopId);
  const row: StaffRevocation = {
    staffId: input.staffId,
    barbershopId: input.barbershopId,
    reason: input.reason,
    revokedAt: Date.now(),
    actorId: input.actorId,
    newGeneration: gen,
  };
  state().byStaffId.set(input.staffId, row);
  state().audit.unshift({
    id: `${Date.now()}-${input.staffId}`,
    at: row.revokedAt,
    actorId: input.actorId ?? null,
    barbershopId: input.barbershopId,
    action: "staff.session_revoke",
    detail: `${input.reason} · staff=${input.staffId} · sg=${gen}`,
  });
  persistRevocation(row);
  if (!isDemoMode()) {
    try {
      const supabase = createServiceClient();
      await supabase.auth.admin.signOut(input.staffId, "global");
    } catch {
      /* sg proof + generation já bastam */
    }
  }
  return row;
}

export function clearStaffRevocation(staffId: string) {
  state().byStaffId.delete(staffId);
  // Não reseta session_generation — tokens com sg antiga permanecem inválidos.
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

export function getCachedSessionGeneration(staffId: string): number | null {
  return state().generationByStaffId.get(staffId) ?? null;
}

/** Auxiliar iat (ms). Insuficiente sozinho para JWT — ver session-epoch.ts. */
export async function isStaffSessionRevokedDurable(
  staffId: string,
  tokenIatMs?: number,
): Promise<boolean> {
  const memAt = getStaffRevokedAt(staffId);
  if (memAt != null) {
    if (tokenIatMs != null && tokenIatMs > memAt) return false;
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
    if (tokenIatMs != null && tokenIatMs > revokedAt) return false;
    return true;
  } catch {
    return true;
  }
}

export function sessionGenerationMatches(
  presented: number | null | undefined,
  current: number | null | undefined,
): boolean {
  if (presented == null || current == null) return false;
  return presented === current;
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
