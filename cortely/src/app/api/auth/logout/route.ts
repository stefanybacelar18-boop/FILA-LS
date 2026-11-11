import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { isDemoMode } from "@/lib/supabase/env";
import {
  SB_ACCESS_COOKIE,
  SB_REFRESH_COOKIE,
} from "@/lib/supabase/auth-cookies";
import { SESSION_GENERATION_COOKIE } from "@/lib/session-epoch";
import {
  createAuthAnonClient,
  readAccessTokenFromRequest,
} from "@/lib/supabase/staff-auth";

export async function POST(req: NextRequest) {
  if (!isDemoMode()) {
    const access = readAccessTokenFromRequest(req);
    if (access) {
      try {
        const supabase = createAuthAnonClient();
        await supabase.auth.setSession({
          access_token: access,
          refresh_token: req.cookies.get(SB_REFRESH_COOKIE)?.value || "",
        });
        await supabase.auth.signOut();
      } catch {
        /* limpa cookies mesmo assim */
      }
    }
  }

  const res = NextResponse.json({ ok: true });
  for (const name of [
    SESSION_COOKIE,
    SB_ACCESS_COOKIE,
    SB_REFRESH_COOKIE,
    SESSION_GENERATION_COOKIE,
  ]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
