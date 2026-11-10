import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeEndTime } from "@/lib/availability";
import {
  createAppointment,
  getShopBundle,
  listAppointments,
  updateAppointmentStatus,
} from "@/lib/data";
import { onlyDigits } from "@/lib/utils";
import { buildWhatsAppConfirmUrl } from "@/lib/whatsapp";

const createSchema = z.object({
  slug: z.string().min(1),
  barber_id: z.string().uuid(),
  service_id: z.string().uuid(),
  client_name: z.string().min(2),
  client_phone: z.string().min(10),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const bundle = await getShopBundle(slug);
  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const appointments = await listAppointments({ barbershopId: bundle.shop.id });
  return NextResponse.json({
    appointments,
    barbers: bundle.barbers,
    services: bundle.services,
    shop: bundle.shop,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json());
    const bundle = await getShopBundle(body.slug);
    if (!bundle) {
      return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
    }

    const barber = bundle.barbers.find((b) => b.id === body.barber_id);
    const service = bundle.services.find((s) => s.id === body.service_id);
    if (!barber || !service) {
      return NextResponse.json({ error: "Barbeiro ou serviço inválido" }, { status: 400 });
    }

    const appointment = await createAppointment({
      barbershop_id: bundle.shop.id,
      barber_id: body.barber_id,
      service_id: body.service_id,
      client_name: body.client_name,
      client_phone: onlyDigits(body.client_phone),
      appointment_date: body.appointment_date,
      start_time: body.start_time,
      end_time: computeEndTime(body.start_time, service.duration_minutes),
    });

    const dateLabel = new Date(`${body.appointment_date}T12:00:00`).toLocaleDateString(
      "pt-BR",
      { weekday: "long", day: "2-digit", month: "long" },
    );

    const whatsappUrl = buildWhatsAppConfirmUrl({
      shopName: bundle.shop.name,
      shopPhone: bundle.shop.phone,
      clientName: body.client_name,
      barberName: barber.name,
      serviceName: service.name,
      dateLabel,
      time: body.start_time,
      price: service.price,
    });

    return NextResponse.json({ appointment, whatsappUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao agendar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = z
      .object({
        id: z.string().uuid(),
        status: z.enum(["confirmed", "completed", "canceled"]),
      })
      .parse(await req.json());

    const appointment = await updateAppointmentStatus(body.id, body.status);
    return NextResponse.json({ appointment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
