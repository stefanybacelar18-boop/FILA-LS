import type { Profile } from "./types";

export async function ensureUserProfile(
  context: "staff" | "motorista"
): Promise<{
  profile: Pick<Profile, "id" | "email" | "full_name" | "role">;
  created: boolean;
} | null> {
  const res = await fetch("/api/auth/ensure-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error as string | undefined;
    if (msg?.includes("operacional")) throw new Error("staff_account");
    if (msg?.includes("motorista")) throw new Error("motorista_account");
    if (msg?.includes("não autorizado") || msg?.includes("nao autorizado")) {
      throw new Error("unauthorized_staff");
    }
    throw new Error(body.detail || body.error || "Falha ao sincronizar perfil");
  }

  return res.json();
}

export function isStaffRole(role: string): boolean {
  return role === "empilhador" || role === "administrador" || role === "operador" || role === "supervisor";
}

export async function completeMotoristaLogin(): Promise<
  Pick<Profile, "id" | "email" | "full_name" | "role">
> {
  const result = await ensureUserProfile("motorista");
  if (!result?.profile || result.profile.role !== "motorista") {
    throw new Error("perfil");
  }
  return result.profile;
}

export function staffRoleLabel(role: string): string {
  if (role === "administrador") return "Administrador";
  if (role === "empilhador" || role === "operador" || role === "supervisor") return "Empilhador";
  return role;
}
