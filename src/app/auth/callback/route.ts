import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureProfileForUser } from "@/lib/ensure-profile-server";
import { resolveMotoristaLandingPath } from "@/lib/motorista-routing";
import { resolveAppOriginFromRequest } from "@/lib/app-url";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function createCallbackClient(request: NextRequest, applyCookie: (c: CookieToSet) => void) {
  return createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            applyCookie({ name, value, options });
          });
        },
      },
    }
  );
}

function redirectWithCookies(url: string, cookies: CookieToSet[]): NextResponse {
  const response = NextResponse.redirect(url);
  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

function authErrorRedirect(origin: string, loginPath: string, detail: string): NextResponse {
  return NextResponse.redirect(
    `${origin}${loginPath}?error=auth&detail=${encodeURIComponent(detail)}`
  );
}

function isSafeInternalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = resolveAppOriginFromRequest(request.url, host);
  const code = searchParams.get("code");
  const context = searchParams.get("context") === "staff" ? "staff" : "motorista";
  const loginPath = context === "staff" ? "/login" : "/login/motorista";

  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (oauthError) {
    const detail =
      errorDescription?.replace(/\+/g, " ") ??
      oauthError ??
      "Erro desconhecido no provedor OAuth";
    console.error("[auth/callback] provider error:", detail);
    return authErrorRedirect(origin, loginPath, detail);
  }

  if (!code) {
    return authErrorRedirect(origin, loginPath, "Código de autorização ausente");
  }

  const sessionCookies: CookieToSet[] = [];
  const supabase = createCallbackClient(request, (cookie) => {
    sessionCookies.push(cookie);
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth/callback] exchange:", exchangeError.message);
    return authErrorRedirect(origin, loginPath, exchangeError.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authErrorRedirect(origin, loginPath, "Usuário não encontrado após login");
  }

  try {
    await ensureProfileForUser(user, context);
  } catch (err) {
    await supabase.auth.signOut();
    const message =
      err instanceof Error && err.message === "staff_account"
        ? "conta_staff"
        : err instanceof Error && err.message === "motorista_account"
          ? "conta_motorista"
          : err instanceof Error && err.message === "unauthorized_staff"
            ? "nao_autorizado"
            : "perfil";
    return NextResponse.redirect(`${origin}${loginPath}?error=${message}`);
  }

  let destination = context === "staff" ? "/empilhador" : "/motorista";
  if (context === "motorista") {
    destination = await resolveMotoristaLandingPath(supabase, user.id);
  }

  const next = searchParams.get("next");
  if (isSafeInternalPath(next)) {
    destination = next;
  }

  return redirectWithCookies(`${origin}${destination}`, sessionCookies);
}
