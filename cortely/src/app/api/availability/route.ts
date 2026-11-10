import { NextRequest, NextResponse } from "next/server";
import { buildAvailableSlots } from "@/lib/availability";
import { getShopBundle, listAppointments } from "@/lib/data";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const barberId = req.nextUrl.searchParams.get("barberId");
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const date = req.nextUrl.searchParams.get("date");

  if (!slug || !barberId || !serviceId || !date) {
    return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
  }

  const bundle = await getShopBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const service = bundle.services.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  }

  const appointments = await listAppointments({
    barbershopId: bundle.shop.id,
    barberId,
    date,
  });

  const slots = buildAvailableSlots({
    workingHours: bundle.workingHours.filter((w) => w.barber_id === barberId),
    appointments,
    dateISO: date,
    durationMinutes: service.duration_minutes,
  });

  return NextResponse.json({ slots });
}
