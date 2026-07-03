"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeMotoristaLogin } from "@/lib/auth-profile";
import { resolveMotoristaLandingPath } from "@/lib/motorista-routing";
import { resolveAppOrigin, oauthRedirectUrl } from "@/lib/app-url";
import { AuthLayout, AuthCard, AuthFooterLink } from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/Button";
import { AlertCircle, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

const ERROR_MESSAGES: Record<string, string> = {
  auth: "Não foi possível concluir o login com Google. Tente novamente.",
  conta_staff:
    "Esta conta é operacional. Use /login com empilhador ou administrador.",
  perfil: "Erro ao sincronizar perfil. Tente novamente ou contate o suporte.",
  nao_autorizado: "Acesso não autorizado para esta área.",
};

type ProviderInfo = {
  settings: { google: boolean; apple: boolean } | null;
  links: { googleProvider: string | null; urlConfiguration: string | null };
  googleCallbackUri: string | null;
};

function formatAuthDetail(detail: string): string {
  const lower = detail.toLowerCase();
  if (lower.includes("unable to exchange external code")) {
    return (
      "O Supabase não conseguiu validar o Google. Confira: (1) Client ID e Secret corretos no Supabase, " +
      "(2) Redirect URI no Google Cloud = https://xctzcizqoussthitrihm.supabase.co/auth/v1/callback, " +
      "(3) seu e-mail como usuário de teste ou app publicado no Google Cloud."
    );
  }
  return detail;
}

function MotoristaLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ProviderInfo | null>(null);

  useEffect(() => {
    const err = searchParams.get("error");
    const detail = searchParams.get("detail");
    if (err && ERROR_MESSAGES[err]) {
      setError(
        err === "auth" && detail
          ? `${ERROR_MESSAGES.auth}\n\n${formatAuthDetail(decodeURIComponent(detail))}`
          : ERROR_MESSAGES[err]
      );
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: ProviderInfo) => setProviders(data))
      .catch(() => setProviders(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) {
        if (!cancelled) setChecking(false);
        return;
      }

      try {
        const profile = await completeMotoristaLogin();
        const path = await resolveMotoristaLandingPath(supabase, profile.id);
        if (!cancelled) router.replace(path);
      } catch (err) {
        await supabase.auth.signOut();
        if (!cancelled) {
          const code = err instanceof Error ? err.message : "perfil";
          setError(ERROR_MESSAGES[code === "staff_account" ? "conta_staff" : "perfil"]);
          setChecking(false);
        }
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function signInWithProvider(provider: "google" | "apple") {
    const enabled =
      provider === "google" ? providers?.settings?.google : providers?.settings?.apple;

    if (providers?.settings && !enabled) {
      setError(
        provider === "google"
          ? "Login com Google não está ativado no Supabase. Peça ao administrador para configurar (veja instruções abaixo)."
          : "Login com Apple não está ativado no Supabase."
      );
      return;
    }

    setOauthLoading(provider);
    setError("");

    const redirectTo = oauthRedirectUrl(resolveAppOrigin(), "motorista");

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (authError) {
      setError(
        provider === "apple"
          ? "Login com Apple indisponível. Contate o administrador."
          : "Login com Google indisponível. Verifique a configuração no Supabase."
      );
      setOauthLoading(null);
    }
  }

  const googleEnabled = providers?.settings?.google ?? null;
  const appleEnabled = providers?.settings?.apple ?? null;
  const showGoogleSetup = providers?.settings && !providers.settings.google;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthLayout subtitle="Área do Motorista">
      <AuthCard>
        <p className="mb-5 text-center text-sm text-slate-600">
          Entre com sua conta Google ou Apple para realizar o check-in no pátio.
        </p>

        {showGoogleSetup && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-2">
                <p className="font-semibold">Google ainda não configurado</p>
                <p className="text-xs leading-relaxed opacity-90">
                  O administrador precisa ativar o Google no Supabase e cadastrar Client ID e
                  Secret do Google Cloud. Sem isso, o login não funciona.
                </p>
                {providers.links.googleProvider && (
                  <a
                    href={providers.links.googleProvider}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline"
                  >
                    Abrir configuração no Supabase
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {providers.googleCallbackUri && (
                  <p className="rounded-lg bg-white/70 px-2 py-1.5 font-mono text-[10px] leading-relaxed break-all">
                    Redirect URI no Google Cloud:
                    <br />
                    {providers.googleCallbackUri}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full border-slate-200 py-3.5 text-base shadow-sm"
            disabled={!!oauthLoading || googleEnabled === false}
            onClick={() => signInWithProvider("google")}
          >
            {oauthLoading === "google" ? (
              <Spinner size="md" className="h-5 w-5" />
            ) : (
              <>
                <GoogleIcon />
                Continuar com Google
              </>
            )}
          </Button>

          <Button
            type="button"
            className="w-full bg-black py-3.5 text-base text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!!oauthLoading || appleEnabled === false}
            onClick={() => signInWithProvider("apple")}
          >
            {oauthLoading === "apple" ? (
              <Spinner size="md" className="h-5 w-5" />
            ) : (
              <>
                <AppleIcon />
                Continuar com Apple
              </>
            )}
          </Button>
        </div>

        {error && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </AuthCard>

      <AuthFooterLink href="/login">Sou empilhador ou admin →</AuthFooterLink>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function MotoristaLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <MotoristaLoginContent />
    </Suspense>
  );
}
