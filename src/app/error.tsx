"use client";

import { useEffect } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";

/** Recuperação de erros client-side — evita tela genérica da Vercel. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FilaDock]", error);
  }, [error]);

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <BrandLogo size="md" variant="stacked" className="opacity-90" />
      <h1 className="text-lg font-semibold text-slate-900">Algo deu errado</h1>
      <p className="max-w-sm text-sm text-slate-600">
        Ocorreu um erro ao carregar esta página. Tente recarregar ou volte ao início.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Tentar novamente
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Ir para início
        </Button>
      </div>
    </div>
  );
}
