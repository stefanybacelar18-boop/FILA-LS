"use client";

import Link from "next/link";
import { PanelShellHeader, PanelPageTitle } from "@/components/brand/PanelShellHeader";
import { MotoristaQueueList } from "@/components/motorista/MotoristaQueueList";
import { usePublicQueueData } from "@/hooks/usePublicQueueData";
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
          <Link href="/login/motorista">
            <Button size="sm" variant="outline" className="text-xs">
              Entrar
            </Button>
          </Link>
        }
      />

      <main className="page-container py-5">
        <PanelPageTitle
          title="Fila de descarga"
          subtitle="Acompanhe a fila do pátio em tempo real — sem precisar fazer login."
        />

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-brand hover:bg-slate-100"
            aria-label="Atualizar fila"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner label="Carregando fila…" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
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
