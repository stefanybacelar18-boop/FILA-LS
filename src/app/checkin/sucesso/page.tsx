"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMotoristaGuard } from "@/hooks/useAuthGuard";
import { getDisplayPlaca } from "@/lib/checkin-rules";
import { isEmViagemStatus } from "@/lib/constants";
import { formatDateTime, formatPrevisaoDate } from "@/lib/utils";
import { MotoristaShell } from "@/components/layout/MotoristaShell";
import { StatusBanner } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { PageLoader } from "@/components/ui/PageLoader";
import type { QueueEntry } from "@/lib/types";

function CheckInSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const importWarning = searchParams.get("warning");
  const supabase = createClient();
  const { profile, checking, authError } = useMotoristaGuard();
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function loadEntry() {
      if (token) {
        const { data } = await supabase
          .from("queue_entries")
          .select(
            "id, token, minuta, status, placa_cavalo, transportadora, retorno_racks_vazios, created_at, previsao_descarregamento"
          )
          .eq("token", token)
          .eq("driver_user_id", profile!.id)
          .is("deleted_at", null)
          .maybeSingle();

        if (cancelled) return;
        if (data) {
          setEntry(data as QueueEntry);
          setLoading(false);
          return;
        }
      }

      const { data: latest } = await supabase
        .from("queue_entries")
        .select(
          "id, token, minuta, status, placa_cavalo, transportadora, retorno_racks_vazios, created_at, previsao_descarregamento"
        )
        .eq("driver_user_id", profile!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setEntry((latest as QueueEntry) ?? null);
      setLoading(false);
    }

    void loadEntry();

    return () => {
      cancelled = true;
    };
  }, [profile, supabase, token]);

  if (authError) {
    return <PageLoader error={authError} onRetry={() => window.location.reload()} />;
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

  const emViagem = isEmViagemStatus(entry.status);

  return (
    <MotoristaShell profile={profile}>
      <div className="space-y-5">
        <StatusBanner
          tone="success"
          icon={<CheckCircle2 className="h-14 w-14" strokeWidth={2.5} />}
          title="Viagem registrada!"
          description={
            emViagem
              ? "Tudo certo. Quando chegar no pátio do PAD, use o botão grande para entrar na fila."
              : "Seus dados foram salvos com sucesso."
          }
        />

        {importWarning === "minuta_nao_importada" && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Minuta não encontrada na base importada pelo admin. Confirme o número ou avise a
            operação — seu check-in foi registrado normalmente.
          </div>
        )}

        {emViagem && (
          <div className="rounded-2xl border-2 border-brand/20 bg-brand/5 p-4">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
              <div className="space-y-2 text-base text-slate-800">
                <p className="font-bold">O que fazer agora?</p>
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>Siga viagem até o pátio do PAD.</li>
                  <li>
                    Ao entrar no pátio, toque em <strong>CHEGUEI NO PÁTIO DO PAD</strong> (botão
                    verde grande).
                  </li>
                  <li>Depois disso você verá sua posição na fila.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        <Card className="card-brand">
          <CardHeader>
            <CardTitle className="text-brand">Resumo</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-base">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Minuta</dt>
              <dd className="font-bold">{entry.minuta || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Placa cavalo</dt>
              <dd className="font-mono font-bold">{getDisplayPlaca(entry)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Previsão de descarregamento</dt>
              <dd className="text-right font-semibold">
                {formatPrevisaoDate(entry.previsao_descarregamento)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Registrado em</dt>
              <dd className="text-right font-semibold">{formatDateTime(entry.created_at)}</dd>
            </div>
          </dl>
        </Card>

        <LinkButton href="/motorista" className="touch-target min-h-[4rem] w-full py-4 text-lg font-bold">
          {emViagem ? (
            <>
              <MapPin className="h-6 w-6" />
              Ir para confirmar chegada no pátio
            </>
          ) : (
            <>
              Ver minha fila
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </LinkButton>

        {emViagem && (
          <p className="text-center text-sm text-slate-500">
            A posição na fila só aparece depois de confirmar a chegada no pátio.
          </p>
        )}
      </div>
    </MotoristaShell>
  );
}

export default function CheckInSuccessPage() {
  return (
    <Suspense fallback={<PageLoader message="Carregando…" />}>
      <CheckInSuccessContent />
    </Suspense>
  );
}
