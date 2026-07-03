"use client";

import type { ReactNode } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { PageLoader } from "@/components/ui/PageLoader";
import type { Profile } from "@/lib/types";

type AuthGateProps = {
  roles: string[];
  loginPath?: string;
  children: (profile: Profile) => ReactNode;
};

/** Aguarda auth + role; exibe loader ou erro antes de renderizar conteúdo protegido. */
export function AuthGate({ roles, loginPath, children }: AuthGateProps) {
  const { profile, checking, authError } = useAuthGuard(roles, loginPath);

  if (authError) {
    return (
      <PageLoader
        error={authError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (checking || !profile) {
    return <PageLoader message="Verificando sessão…" />;
  }

  return <>{children(profile)}</>;
}
