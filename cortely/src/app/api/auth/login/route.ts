import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  authenticateStaff,
  encodeSession,
} from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/supabase/env";
import {
  SB_ACCESS_COOKIE,
  SB_COOKIE_MAX_AGE,
  SB_REFRESH_COOKIE,
} from "@/lib/supabase/auth-cookies";
import {
  SESSION_GENERATION_COOKIE,
  encodeSessionGenerationProof,
} from "@/lib/session-epoch";
import {
  createAuthAnonClient,
  loadActiveStaffProfile,
} from "@/lib/supabase/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(await req.json());

    const ip = clientIp(req);
    const email = body.email.trim().toLowerCase();
    const limited = checkRateLimit(`login:${ip}:${email}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: limited.error, retryAfterSec: limited.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    if (isDemoMode()) {
      const session = await authenticateStaff(email, body.password);
      if (!session) {
        return NextResponse.json(
          { error: "E-mail ou senha inválidos" },
          { status: 401 },
        );
      }
      const token = encodeSession(session);
      const res = NextResponse.json({ user: session, mode: "demo" });
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 8,
      });
      // Demo: geração já está assinada dentro do HMAC cortely_session (campo sg).
      res.cookies.set(SESSION_GENERATION_COOKIE, "", { path: "/", maxAge: 0 });
      res.cookies.set(SB_ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
      res.cookies.set(SB_REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    const supabase = createAuthAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos" },
        { status: 401 },
      );
    }

    if (!data.user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Confirme seu e-mail antes de entrar" },
        { status: 403 },
      );
    }

    // Ativa convites pending_email após confirmação
    try {
      const { activateInvitedStaff } = await import("@/lib/data");
      await activateInvitedStaff(data.user.id);
    } catch {
      /* ignore se não for convite pendente */
    }

    const profile = await loadActiveStaffProfile(data.user.id);
    if (!profile) {
      return NextResponse.json(
        {
          error:
            "Conta sem barbearia ativa. Conclua o onboarding após confirmar o e-mail.",
          code: "ONBOARDING_REQUIRED",
        },
        { status: 403 },
      );
    }

    const sg =
      typeof profile.session_generation === "number"
        ? profile.session_generation
        : 1;
    const user = {
      id: profile.id,
      email: profile.email ?? email,
      full_name: profile.full_name ?? "",
      role: profile.role,
      barbershop_id: profile.barbershop_id,
      barber_id: profile.barber_id ?? null,
      session_generation: sg,
    };

    const res = NextResponse.json({ user, mode: "supabase" });
    res.cookies.set(SB_ACCESS_COOKIE, data.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: SB_COOKIE_MAX_AGE,
    });
    res.cookies.set(SB_REFRESH_COOKIE, data.session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.set(
      SESSION_GENERATION_COOKIE,
      encodeSessionGenerationProof({
        userId: user.id,
        sessionGeneration: sg,
        accessToken: data.session.access_token,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: SB_COOKIE_MAX_AGE,
      },
    );
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no login";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
