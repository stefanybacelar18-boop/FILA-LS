import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import {
  SB_ACCESS_COOKIE,
  SB_COOKIE_MAX_AGE,
  SB_REFRESH_COOKIE,
} from "@/lib/supabase/auth-cookies";
import {
  getSupabaseAuthUser,
  loadActiveStaffProfile,
  readAccessTokenFromRequest,
} from "@/lib/supabase/staff-auth";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Após e-mail confirmado: provisiona barbearia + profile owner (idempotente).
 * Service role chama RPC; p_user_id = JWT verificado.
 */
export async function POST(req: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Onboarding exige Supabase Auth (fora do DEMO MODE)" },
        { status: 503 },
      );
    }

    const accessToken = readAccessTokenFromRequest(req);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Faça login após confirmar o e-mail" },
        { status: 401 },
      );
    }

    const user = await getSupabaseAuthUser(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Confirme seu e-mail antes de criar a barbearia" },
        { status: 403 },
      );
    }

    const body = z
      .object({
        shop_name: z.string().min(2).max(120),
        shop_slug: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        shop_phone: z.string().min(10).max(20),
        full_name: z.string().min(2).max(120).optional(),
      })
      .parse(await req.json());

    const ip = clientIp(req);
    const limited = checkRateLimit(`onboard:${user.id}:${ip}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
      lockMs: 30 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: limited.error, retryAfterSec: limited.retryAfterSec },
        { status: 429 },
      );
    }

    const service = createServiceClient();
    const { data, error } = await service.rpc("provision_owner_barbershop", {
      p_user_id: user.id,
      p_full_name:
        body.full_name?.trim() ||
        (user.user_metadata?.full_name as string) ||
        user.email ||
        "Proprietário",
      p_email: user.email ?? "",
      p_shop_name: body.shop_name.trim(),
      p_shop_slug: body.shop_slug.trim().toLowerCase(),
      p_shop_phone: body.shop_phone.trim(),
    });

    if (error) {
      const msg = error.message || "Falha no provisionamento";
      const status = msg.includes("slug") ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const profile = await loadActiveStaffProfile(user.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Provisionamento incompleto" },
        { status: 500 },
      );
    }

    // Renova sessão cookies (mantém tokens atuais)
    const res = NextResponse.json({
      ok: true,
      barbershop_id: row?.barbershop_id ?? profile.barbershop_id,
      status: row?.status ?? "ready",
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        barbershop_id: profile.barbershop_id,
        barber_id: profile.barber_id,
      },
    });
    res.cookies.set(SB_ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: SB_COOKIE_MAX_AGE,
    });
    const refresh = req.cookies.get(SB_REFRESH_COOKIE)?.value;
    if (refresh) {
      res.cookies.set(SB_REFRESH_COOKIE, refresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha no onboarding";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
