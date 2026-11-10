import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  authenticateStaff,
  encodeSession,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(4),
      })
      .parse(await req.json());

    const session = await authenticateStaff(body.email, body.password);
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
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no login";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
