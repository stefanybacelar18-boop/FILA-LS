import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Verificação de saúde para monitoramento (Vercel, uptime). */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "filadock",
      version: process.env.npm_package_version ?? "1.0.0",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
