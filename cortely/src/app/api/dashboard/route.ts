import { NextRequest, NextResponse } from "next/server";
import { getRequestSession, requirePermission } from "@/lib/auth";
import { getDashboard, getShopBundle } from "@/lib/data";

export async function GET(req: NextRequest) {
  try {
    const session = getRequestSession(req);
    requirePermission(session, "agenda");

    const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
    const bundle = await getShopBundle(slug);
    if (!bundle) {
      return NextResponse.json(
        { error: "Barbearia não encontrada" },
        { status: 404 },
      );
    }
    if (bundle.shop.id !== session!.barbershop_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const dashboard = await getDashboard(bundle.shop.id);
    return NextResponse.json({
      ...dashboard,
      shop: bundle.shop,
      barbers: bundle.barbers,
      services: bundle.services,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro";
    const status =
      message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
