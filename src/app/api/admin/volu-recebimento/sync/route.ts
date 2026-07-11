import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdmin } from "@/lib/role-permissions";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";
import {
  syncVoluRecebimentoFromMonitoramento,
  workbookToArrayBuffer,
  VOLU_PAD,
} from "@/lib/volu-recebimento-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<
  { user: { id: string } } | { error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !canAccessAdmin(profile.role)) {
    return { error: NextResponse.json({ error: "Acesso negado" }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const rateKey = `volu-sync:${auth.user.id}`;
    if (!rateLimitAllow(rateKey, 10, 10 * 60_000)) {
      return NextResponse.json(
        { error: "rate_limit", message: "Aguarde antes de sincronizar novamente." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitRetryAfterSec(rateKey, 10 * 60_000)),
          },
        }
      );
    }

    const form = await request.formData();
    const voluFile = form.get("volu");
    const monitoramentoFile = form.get("monitoramento");

    if (!(voluFile instanceof Blob) || !(monitoramentoFile instanceof Blob)) {
      return NextResponse.json(
        {
          error:
            "Envie os dois arquivos: Volu Recebimento (volu) e Monitoramento Descida (monitoramento).",
        },
        { status: 400 }
      );
    }

    if (monitoramentoFile.size < 100) {
      return NextResponse.json(
        {
          error:
            "O arquivo de Monitoramento parece vazio. Baixe novamente o Excel completo (não o atalho de 0 KB).",
        },
        { status: 400 }
      );
    }

    const voluBuf = Buffer.from(await voluFile.arrayBuffer());
    const monBuf = Buffer.from(await monitoramentoFile.arrayBuffer());

    const voluWb = XLSX.read(voluBuf, { type: "buffer", cellDates: true });
    const monWb = XLSX.read(monBuf, { type: "buffer", cellDates: true });

    const { workbook, stats } = syncVoluRecebimentoFromMonitoramento(
      voluWb,
      monWb,
      VOLU_PAD
    );

    if (stats.monitoramentoRows === 0) {
      return NextResponse.json(
        {
          error: `Nenhuma linha com PAD ${VOLU_PAD} e CHEGADA PAD encontrada no Monitoramento.`,
        },
        { status: 400 }
      );
    }

    const out = workbookToArrayBuffer(workbook);
    const originalName =
      voluFile instanceof File && voluFile.name
        ? voluFile.name.replace(/\.xlsx$/i, "")
        : `Volu_Recebimento_${VOLU_PAD}`;
    const filename = `${originalName}_atualizado.xlsx`;

    return new NextResponse(Buffer.from(out), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Volu-Stats": JSON.stringify(stats),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao sincronizar Volu.";
    console.error("[volu-recebimento/sync]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
