import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendDriverPushNotification } from "@/lib/driver-push";

/** Envia push de teste para o motorista logado (validar app fechado). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "motorista") {
    return NextResponse.json({ error: "Apenas motorista" }, { status: 403 });
  }

  const result = await sendDriverPushNotification(user.id, {
    title: "FilaDock — Teste de chamada",
    body: "Se voce recebeu isto, notificacoes com app fechado estao funcionando.",
    url: "/motorista",
    tag: `driver-test-${Date.now()}`,
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: result.reason ?? "Nao foi possivel enviar o push de teste." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, sent: result.sent });
}
