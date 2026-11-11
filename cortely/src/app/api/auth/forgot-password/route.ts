import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/supabase/env";
import { createAuthAnonClient } from "@/lib/supabase/staff-auth";

export async function POST(req: NextRequest) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Recuperação de senha disponível fora do DEMO MODE" },
        { status: 503 },
      );
    }

    const { email } = z
      .object({ email: z.string().email() })
      .parse(await req.json());

    const ip = clientIp(req);
    const limited = checkRateLimit(`forgot:${ip}:${email.toLowerCase()}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: limited.error, retryAfterSec: limited.retryAfterSec },
        { status: 429 },
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const supabase = createAuthAnonClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/pro/auth/reset`,
    });

    // Sem enumeração de e-mails
    return NextResponse.json({
      ok: true,
      message:
        "Se o e-mail estiver cadastrado, enviaremos instruções de redefinição.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
