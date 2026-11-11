import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import { createAuthAnonClient } from "@/lib/supabase/staff-auth";

/**
 * Cadastro do proprietário (Supabase Auth).
 * NÃO cria barbearia até confirmação de e-mail + complete-onboarding.
 */
export async function POST(req: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        {
          error:
            "Cadastro de proprietário exige modo produção (Supabase Auth). Em demo use as contas seed.",
        },
        { status: 503 },
      );
    }

    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
        full_name: z.string().min(2).max(120),
      })
      .parse(await req.json());

    const ip = clientIp(req);
    const limited = checkRateLimit(`register:${ip}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
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

    const email = body.email.trim().toLowerCase();
    const supabase = createAuthAnonClient();
    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const { data, error } = await supabase.auth.signUp({
      email,
      password: body.password,
      options: {
        data: { full_name: body.full_name.trim() },
        emailRedirectTo: `${origin}/pro/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      try {
        const service = createServiceClient();
        await service.from("profiles").upsert(
          {
            id: data.user.id,
            email,
            full_name: body.full_name.trim(),
            role: "owner",
            barbershop_id: null,
            is_active: false,
            provisioning_status: "pending_email",
          },
          { onConflict: "id" },
        );
      } catch {
        /* profile pode ser criado no complete-onboarding */
      }
    }

    // Resposta uniforme — não revela se o e-mail já existia
    return NextResponse.json({
      ok: true,
      message:
        "Se o e-mail for válido, enviaremos um link de confirmação. A barbearia só é criada após a confirmação.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no cadastro";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
