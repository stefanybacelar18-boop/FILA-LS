import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, getShopBundle, listAppointments, listClients } from "@/lib/data";
import { opsStore } from "@/lib/ops-store";
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
  const clients = await listClients(bundle.shop.id, onlyDigits(phone));
  const client = clients.find((c) => c.phone === onlyDigits(phone));
  const snap = opsStore.snapshot();
  const clientPackages = client
    ? snap.clientPackages.filter((p) => p.client_id === client.id)
    : [];
  const packages = snap.packages.filter((p) => p.is_active);
  const subscriptions = client
    ? snap.clientSubscriptions.filter((s) => s.client_id === client.id)
    : [];

  return NextResponse.json({
    appointments,
    loyalty,
    threshold: bundle.shop.loyalty_threshold,
    reward: bundle.shop.loyalty_reward,
    cancelHoursBefore: bundle.shop.cancel_hours_before,
    barbers: bundle.barbers,
    services: bundle.services,
    shop: bundle.shop,
    client,
    packages,
    clientPackages,
    subscriptions,
    plans: snap.subscriptionPlans.filter((p) => p.is_active),
  });
}
