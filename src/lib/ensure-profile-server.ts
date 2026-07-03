import { createAdminClient } from "@/lib/supabase/admin";
import { FIXED_ACCOUNT_ROLES } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

const STAFF_ROLES = ["administrador", "empilhador", "operador", "supervisor"];

function expectedRoleForEmail(email: string | undefined): UserRole | undefined {
  if (!email) return undefined;
  return FIXED_ACCOUNT_ROLES[email.toLowerCase()];
}

async function repairFixedAccountRole(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string,
  currentRole: UserRole
) {
  const expected = expectedRoleForEmail(email);
  if (!expected || expected === currentRole) return null;

  const { data, error } = await admin
    .from("profiles")
    .update({ role: expected })
    .eq("id", userId)
    .select("id, email, full_name, role")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function ensureProfileForUser(
  user: User,
  context: "motorista" | "staff"
) {
  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  let profile = existing;

  if (profile && user.email) {
    const repaired = await repairFixedAccountRole(
      admin,
      user.id,
      user.email,
      profile.role as UserRole
    );
    if (repaired) profile = repaired;
  }

  if (profile) {
    const role = profile.role as UserRole;
    if (context === "motorista" && STAFF_ROLES.includes(role)) {
      throw new Error("staff_account");
    }
    if (context === "staff" && role === "motorista") {
      throw new Error("motorista_account");
    }
    if (context === "staff" && !STAFF_ROLES.includes(role)) {
      throw new Error("unauthorized_staff");
    }
    return { profile, created: false };
  }

  if (context === "staff") {
    throw new Error("unauthorized_staff");
  }

  const fixedRole = expectedRoleForEmail(user.email);
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Motorista";

  const { data: created, error: insertError } = await admin
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email!,
      full_name: fullName,
      role: fixedRole ?? "motorista",
    })
    .select("id, email, full_name, role")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { profile: created, created: true };
}
