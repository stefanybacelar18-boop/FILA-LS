import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdmin } from "@/lib/role-permissions";
import { isActiveQueueStatus, statusForDatabase } from "@/lib/constants";
import { getStatusTimestampUpdates } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
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

    if (!profile?.role || !canAccessAdmin(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    let body: { email?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Informe o e-mail do motorista" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: driver, error: driverError } = await admin
      .from("profiles")
      .select("id, email, full_name, role, checkin_liberado")
      .ilike("email", email)
      .maybeSingle();

    if (driverError) {
      if (/checkin_liberado|column .* does not exist/i.test(driverError.message)) {
        return NextResponse.json(
          {
            error:
              "Coluna checkin_liberado não existe. Rode supabase/evolucao-v1-parte2.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: driverError.message }, { status: 500 });
    }

    if (!driver) {
      return NextResponse.json(
        { error: `Nenhum motorista encontrado com o e-mail ${email}` },
        { status: 404 }
      );
    }

    if (driver.role !== "motorista") {
      return NextResponse.json(
        { error: "Esta conta não é de motorista" },
        { status: 400 }
      );
    }

    const { data: entries, error: entriesError } = await admin
      .from("queue_entries")
      .select("id, status")
      .eq("driver_user_id", driver.id)
      .is("deleted_at", null);

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    const activeIds = (entries ?? [])
      .filter((e) => isActiveQueueStatus(e.status))
      .map((e) => e.id);

    if (activeIds.length > 0) {
      const finishedPatch = {
        status: statusForDatabase("finalizado"),
        ...getStatusTimestampUpdates("finalizado"),
      };

      const { error: finalizeError } = await admin
        .from("queue_entries")
        .update(finishedPatch)
        .in("id", activeIds);

      if (finalizeError) {
        return NextResponse.json({ error: finalizeError.message }, { status: 500 });
      }
    }

    const { error: liberarError } = await admin
      .from("profiles")
      .update({ checkin_liberado: true })
      .eq("id", driver.id);

    if (liberarError) {
      return NextResponse.json({ error: liberarError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      email: driver.email,
      nome: driver.full_name,
      finalizados: activeIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
