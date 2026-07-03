import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileForUser } from "@/lib/ensure-profile-server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let context: "motorista" | "staff" = "staff";
  try {
    const body = await request.json();
    if (body?.context === "motorista") context = "motorista";
    else if (body?.context === "staff") context = "staff";
  } catch {
    // body opcional
  }

  try {
    const result = await ensureProfileForUser(user, context);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (message === "staff_account") {
      return NextResponse.json(
        { error: "Esta conta é operacional. Use /login" },
        { status: 403 }
      );
    }
    if (message === "motorista_account") {
      return NextResponse.json(
        { error: "Esta conta é de motorista. Use /login/motorista" },
        { status: 403 }
      );
    }
    if (message === "unauthorized_staff") {
      return NextResponse.json(
        { error: "Conta não autorizada. Peça cadastro ao administrador." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Erro ao sincronizar perfil", detail: message }, { status: 500 });
  }
}
