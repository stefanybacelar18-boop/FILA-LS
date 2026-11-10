import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, getShopBundle, listAppointments } from "@/lib/data";
import { onlyDigits } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || onlyDigits(phone).length < 10) {
    return NextResponse.json({ error: "Informe um WhatsApp válido" }, { status: 400 });
  }

  const bundle = await getShopBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const appointments = await listAppointments({
    barbershopId: bundle.shop.id,
    phone,
  });
  const loyalty = await getLoyalty(bundle.shop.id, phone);

  return NextResponse.json({
    appointments,
    loyalty,
    threshold: bundle.shop.loyalty_threshold,
    reward: bundle.shop.loyalty_reward,
    barbers: bundle.barbers,
    services: bundle.services,
  });
}
