import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/supabase/env";
import {
  createAuthAnonClient,
  getSupabaseAuthUser,
  readAccessTokenFromRequest,
} from "@/lib/supabase/staff-auth";
import { SB_REFRESH_COOKIE } from "@/lib/supabase/auth-cookies";

/** Redefine senha com sessão autenticada (após link de recovery). */
export async function POST(req: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Indisponível no DEMO MODE" },
        { status: 503 },
      );
    }

    const access = readAccessTokenFromRequest(req);
    if (!access) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    const user = await getSupabaseAuthUser(access);
    if (!user) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }

    const { password } = z
      .object({ password: z.string().min(8).max(72) })
      .parse(await req.json());

    const supabase = createAuthAnonClient();
    await supabase.auth.setSession({
      access_token: access,
      refresh_token: req.cookies.get(SB_REFRESH_COOKIE)?.value || "",
    });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
