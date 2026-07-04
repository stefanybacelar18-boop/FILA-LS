"use client";

import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/brand/BrandLogo";

type PageLoaderProps = {
  message?: string;
  error?: string | null;
  onRetry?: () => void;
};

/** Estado de carregamento ou erro em tela cheia (auth, dados iniciais). */
export function PageLoader({
  message = "Carregando…",
  error,
  onRetry,
}: PageLoaderProps) {
  if (error) {
    return (
      <div
        className="app-canvas flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
        role="alert"
      >
        <BrandLogo size="sm" className="opacity-60" />
        <p className="max-w-sm text-sm text-red-600">{error}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Recarregar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="app-canvas flex min-h-screen flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="lg" />
      <p className="section-eyebrow">{message}</p>
    </div>
  );
}
