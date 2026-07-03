"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeMotoristaLogin, isStaffRole } from "@/lib/auth-profile";
import type { Profile } from "@/lib/types";
import { toAppRole } from "@/lib/types";

function isRoleAllowed(role: string, allowed: string[]): boolean {
  if (allowed.includes(role)) return true;
  const app = toAppRole(role);
  return allowed.includes(app);
}

export function useAuthGuard(allowedRoles: string[], loginPath = "/login") {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const redirected = useRef(false);

  const rolesKey = useMemo(() => allowedRoles.join(","), [allowedRoles]);
  // rolesKey stabilizes deps when callers pass inline array literals
  // eslint-disable-next-line react-hooks/exhaustive-deps -- allowedRoles encoded in rolesKey
  const roles = useMemo(() => allowedRoles, [rolesKey]);
  const isMotoristaOnly =
    roles.length === 1 && roles[0] === "motorista";

  useEffect(() => {
    let cancelled = false;
    redirected.current = false;

    async function redirectTo(path: string) {
      if (redirected.current || cancelled) return;
      redirected.current = true;
      setChecking(false);
      router.replace(path);
    }

    async function check() {
      setAuthError(null);
      const slowTimer = setTimeout(() => {
        if (!cancelled && !redirected.current) {
          setAuthError(
            "Conexão lenta com o servidor. Recarregue a página ou verifique a internet."
          );
          setChecking(false);
        }
      }, 12_000);

      try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setProfile(null);
          setChecking(false);
        }
        if (!redirected.current) await redirectTo(loginPath);
        return;
      }

      let profileData: Profile | null = null;

      if (isMotoristaOnly) {
        try {
          const synced = await completeMotoristaLogin();
          profileData = synced as Profile;
        } catch (err) {
          const code = err instanceof Error ? err.message : "perfil";
          await supabase.auth.signOut();
          const errorParam =
            code === "staff_account" ? "conta_staff" : "perfil";
          await redirectTo(`${loginPath}?error=${errorParam}`);
          return;
        }
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        profileData = data as Profile | null;
      }

      const role = profileData?.role;

      if (!profileData || !role || !isRoleAllowed(role, roles)) {
        if (isMotoristaOnly && role && isStaffRole(role)) {
          await supabase.auth.signOut();
          await redirectTo(`${loginPath}?error=conta_staff`);
          return;
        }
        await redirectTo(loginPath);
        return;
      }

      if (!cancelled) {
        setProfile(profileData as Profile);
        setChecking(false);
      }
      } finally {
        clearTimeout(slowTimer);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [supabase, router, rolesKey, loginPath, roles, isMotoristaOnly]);

  return { profile, checking, user: profile, authError };
}

export function useMotoristaGuard() {
  return useAuthGuard(["motorista"], "/login/motorista");
}
