"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Truck } from "lucide-react";
import { COMPANY_NAME } from "@/lib/constants";

/** Cadastro substituído por login Google/Apple */
export default function CadastroMotoristaPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/login/motorista"), 4000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
      <Card className="card-brand w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <Truck className="mx-auto h-12 w-12 text-brand" />
          <CardTitle className="text-brand">{COMPANY_NAME}</CardTitle>
          <p className="mt-2 text-slate-600">
            O cadastro agora é feito com sua conta Google ou Apple.
          </p>
        </CardHeader>
        <Link href="/login/motorista">
          <Button className="w-full py-3 text-lg">Entrar com Google ou Apple</Button>
        </Link>
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Spinner size="sm" />
          Redirecionando...
        </p>
      </Card>
    </div>
  );
}
