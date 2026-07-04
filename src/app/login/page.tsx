"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isStaffRole } from "@/lib/auth-profile";
import { staffHomePath } from "@/lib/role-permissions";
import { safeInternalPath } from "@/lib/safe-redirect";
import { AuthLayout, AuthCard, AuthFooterLink } from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Shield } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

const ERROR_MESSAGES: Record<string, string> = {
  conta_motorista: "Esta conta é de motorista. Use /login/motorista.",
  conta_staff: "Esta conta é operacional. Use /login com empilhador ou admin.",
  nao_autorizado: "Conta não autorizada. Peça ao administrador criar seu perfil.",
  perfil: "Não foi possível carregar seu perfil. Tente novamente.",
  auth: "Falha na autenticação. Tente novamente.",
  acesso: "Você não tem permissão para acessar esta área.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const err = searchParams.get("error");
    if (err && ERROR_MESSAGES[err]) setError(ERROR_MESSAGES[err]);
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    let redirecting = false;

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(
          authError.message.includes("Invalid login")
            ? "E-mail ou senha inválidos."
            : authError.message
        );
        return;
      }

      if (!data.user) {
        setError("Não foi possível autenticar.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        setError("Perfil não encontrado. Peça ao administrador criar seu usuário.");
        await supabase.auth.signOut();
        return;
      }

      const role = profile.role;

      if (role === "motorista") {
        setError(ERROR_MESSAGES.conta_motorista);
        await supabase.auth.signOut();
        return;
      }

      if (!isStaffRole(role)) {
        setError("Perfil sem acesso ao sistema.");
        await supabase.auth.signOut();
        return;
      }

      const destination = safeInternalPath(
        searchParams.get("next"),
        staffHomePath(role)
      );

      await supabase.auth.getSession();
      redirecting = true;
      window.location.assign(destination);
    } catch {
      setError("Erro inesperado. Verifique sua conexão.");
    } finally {
      if (!redirecting) setLoading(false);
    }
  }

  return (
    <AuthLayout variant="dark" subtitle="Acesso operacional">
      <AuthCard>
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <Shield className="h-4 w-4 text-brand" />
          <span>Empilhador e administrador</span>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="empilhador@lsl.com"
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          <Button type="submit" className="w-full py-3" disabled={loading}>
            {loading ? <Spinner size="sm" /> : "Entrar"}
          </Button>
        </form>
      </AuthCard>

      <AuthFooterLink href="/login/motorista" dark>
        Sou motorista →
      </AuthFooterLink>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
