import { NextRequest, NextResponse } from "next/server";
import { verifyClientProof } from "@/lib/auth";
import { getLoyalty, getShopBundle, listAppointments, listClients } from "@/lib/data";
import { opsStore } from "@/lib/ops-store";
import { onlyDigits } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const phone = req.nextUrl.searchParams.get("phone");
  // Token só no header — nunca na query (evita vazamento em logs/Referer).
  const proof = req.headers.get("x-cortely-client");

  if (!phone || onlyDigits(phone).length < 10) {
    return NextResponse.json({ error: "Informe um WhatsApp válido" }, { status: 400 });
  }

  const digits = onlyDigits(phone);
  const bundle = await getShopBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const verifiedPhone = await verifyClientProof(proof, digits, bundle.shop.id);
  if (!verifiedPhone) {
    return NextResponse.json(
      { error: "Verifique o WhatsApp com OTP antes de consultar seus dados" },
      { status: 401 },
    );
  }

  const appointments = await listAppointments({
    barbershopId: bundle.shop.id,
    phone: digits,
  });
  const loyalty = await getLoyalty(bundle.shop.id, digits);
  const clients = await listClients(bundle.shop.id, digits);
  const client = clients.find((c) => c.phone === digits);
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
    shop: {
      id: bundle.shop.id,
      name: bundle.shop.name,
      slug: bundle.shop.slug,
      cancel_hours_before: bundle.shop.cancel_hours_before,
      loyalty_threshold: bundle.shop.loyalty_threshold,
      loyalty_reward: bundle.shop.loyalty_reward,
    },
    client: client
      ? {
          id: client.id,
          full_name: client.full_name,
          phone: client.phone,
        }
      : null,
    packages,
    clientPackages,
    subscriptions,
    plans: snap.subscriptionPlans.filter((p) => p.is_active),
  });
}
