import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  authenticateStaff,
  encodeSession,
} from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

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

    const session = await authenticateStaff(email, body.password);
    if (!session) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos" },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ user: session });
    res.cookies.set(SESSION_COOKIE, encodeSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no login";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
