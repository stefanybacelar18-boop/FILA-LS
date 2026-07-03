import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import {
  isPublicPath,
  loginPathForRole,
  requiredRoleForPath,
  roleMatchesPath,
} from "@/lib/route-guards";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const AUTH_TIMEOUT_MS = 8_000;

type AuthGetUserResult = Awaited<ReturnType<ReturnType<typeof createServerClient>["auth"]["getUser"]>>;

async function getUserWithTimeout(
  getUser: () => Promise<AuthGetUserResult>
): Promise<AuthGetUserResult> {
  return Promise.race([
    getUser(),
    new Promise<AuthGetUserResult>((resolve) =>
      setTimeout(
        () =>
          resolve({ data: { user: null }, error: null } as unknown as AuthGetUserResult),
        AUTH_TIMEOUT_MS
      )
    ),
  ]);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // Rotas de API autenticam internamente; evita bloquear polls da TV/motorista no getUser().
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await getUserWithTimeout(() => supabase.auth.getUser());

  const requiredRole = requiredRoleForPath(pathname);

  if (!requiredRole || isPublicPath(pathname)) {
    return supabaseResponse;
  }

  if (!user) {
    const login = loginPathForRole(requiredRole);
    const url = request.nextUrl.clone();
    url.pathname = login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.role || !roleMatchesPath(profile.role, requiredRole)) {
    const login = loginPathForRole(requiredRole);
    const url = request.nextUrl.clone();
    url.pathname = login;
    url.searchParams.set("error", "acesso");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
