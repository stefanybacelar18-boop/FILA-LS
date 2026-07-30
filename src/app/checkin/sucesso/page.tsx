"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/ui/PageLoader";

function RedirectToMotorista() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams({ registrado: "1" });
    const warning = searchParams.get("warning");
    if (warning) params.set("warning", warning);
    router.replace(`/motorista?${params.toString()}`);
  }, [router, searchParams]);

  return <PageLoader message="Viagem registrada! Abrindo seu painel…" />;
}

/** Mantido por links antigos — redireciona para o painel unificado. */
export default function CheckInSuccessPage() {
  return (
    <Suspense fallback={<PageLoader message="Carregando…" />}>
      <RedirectToMotorista />
    </Suspense>
  );
}
