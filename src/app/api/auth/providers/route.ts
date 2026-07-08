import { NextResponse } from "next/server";
import { fetchAuthProviderSettings, getSupabaseProjectRef, supabaseDashboardUrl } from "@/lib/auth-providers";

export async function GET() {
  const settings = await fetchAuthProviderSettings();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return NextResponse.json(
      { settings },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  }

  const ref = getSupabaseProjectRef();

  return NextResponse.json({
    settings,
    projectRef: ref,
    links: {
      googleProvider: supabaseDashboardUrl("/auth/providers?provider=Google"),
      urlConfiguration: supabaseDashboardUrl("/auth/url-configuration"),
    },
    googleCallbackUri: ref ? `https://${ref}.supabase.co/auth/v1/callback` : null,
  });
}
