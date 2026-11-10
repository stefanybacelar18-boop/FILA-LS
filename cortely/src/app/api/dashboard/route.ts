import { NextRequest, NextResponse } from "next/server";
import { getDashboard, getShopBundle } from "@/lib/data";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const bundle = await getShopBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const dashboard = await getDashboard(bundle.shop.id);
  return NextResponse.json({
    ...dashboard,
    shop: bundle.shop,
    barbers: bundle.barbers,
    services: bundle.services,
  });
}
