"use client";

import Link from "next/link";
import { PanelShellHeader, PanelPageTitle } from "@/components/brand/PanelShellHeader";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { usePublicQueueData } from "@/hooks/usePublicQueueData";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshCw } from "lucide-react";

export default function FilaDescargaPage() {
  const { entries, loading, error, refresh } = usePublicQueueData();

  return (
    <div className="min-h-screen app-canvas-mobile pb-8">
      <PanelShellHeader
        logoHref="/"
        trailing={
          <LinkButton href="/login/motorista" size="sm" variant="outline" className="text-xs">
            Entrar
          </LinkButton>
        }
      />

      <main className="page-container shell-main">
        <PanelPageTitle
          title="Fila de descarga"
          subtitle="Acompanhe a fila do pátio em tempo real — sem precisar fazer login."
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            className="text-brand"
            aria-label="Atualizar fila"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </PanelPageTitle>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Carregando fila…" />
          </div>
        ) : error ? (
          <p className="alert-error">{error}</p>
        ) : (
          <MotoristaQueueList entries={entries} title="Fila do pátio" />
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Motorista?{" "}
          <Link href="/login/motorista" className="font-semibold text-brand underline-offset-2 hover:underline">
            Faça login para check-in
          </Link>
        </p>
      </main>
    </div>
  );
}
