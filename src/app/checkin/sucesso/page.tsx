"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMotoristaGuard } from "@/hooks/useAuthGuard";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { getStatusLabel } from "@/lib/constants";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { StatusBanner } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { CheckCircle2, ListOrdered, Truck } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { PageLoader } from "@/components/ui/PageLoader";
import type { QueueEntry } from "@/lib/types";

function CheckInSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const supabase = createClient();
  const { profile, checking, authError } = useMotoristaGuard();
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    async function loadEntry() {
      if (token) {
        const { data } = await supabase
          .from("queue_entries")
          .select("*")
          .eq("token", token)
          .eq("driver_user_id", profile!.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (data) {
          setEntry(data as QueueEntry);
          setLoading(false);
          return;
        }
      }

      const { data: latest } = await supabase
        .from("queue_entries")
        .select("*")
        .eq("driver_user_id", profile!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setEntry((latest as QueueEntry) ?? null);
      setLoading(false);
    }

    loadEntry();
  }, [profile, supabase, token]);

  if (authError) {
    return (
      <PageLoader error={authError} onRetry={() => window.location.reload()} />
    );
  }

  if (checking || !profile) {
    return <PageLoader message="Verificando sessão…" />;
  }

  if (loading) {
    return (
      <MotoristaShell profile={profile}>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </MotoristaShell>
    );
  }

  if (!entry) {
    router.replace("/checkin");
    return null;
  }

  return (
    <MotoristaShell profile={profile}>
      <div className="space-y-5">
        <StatusBanner
          tone="success"
          icon={<CheckCircle2 className="h-14 w-14" strokeWidth={2.5} />}
          title="Check-in realizado!"
          description="Seus dados foram registrados. Aguarde sua vez na fila de descarga."
        />

        <Card className="card-brand">
          <CardHeader>
            <CardTitle className="text-brand">Resumo do check-in</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-semibold text-right">{getStatusLabel(entry.status)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Minuta</dt>
              <dd className="font-semibold">{entry.minuta || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Placa cavalo</dt>
              <dd className="font-mono font-bold">{getDisplayPlaca(entry)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Transportadora</dt>
              <dd className="text-right">{entry.transportadora || "—"}</dd>
            </div>
            {entry.retorno_racks_vazios && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Retorno racks vazios</dt>
                <dd className="font-semibold text-teal-700">Sim</dd>
              </div>
            )}
          </dl>
        </Card>

        <p className="text-center text-sm text-slate-500">
          Você receberá atualizações quando for chamado para a doca.
        </p>

        <LinkButton href="/minha-fila" className="w-full py-3.5 text-base">
          <ListOrdered className="h-5 w-5" />
          Acompanhar minha posição na fila
        </LinkButton>

        <LinkButton href="/motorista" variant="outline" className="w-full py-3.5 text-base">
          <Truck className="h-5 w-5" />
          Voltar ao início
        </LinkButton>
      </div>
    </MotoristaShell>
  );
}

export default function CheckInSuccessPage() {
  return (
    <Suspense
      fallback={<PageLoader message="Carregando…" />}
    >
      <CheckInSuccessContent />
    </Suspense>
  );
}
