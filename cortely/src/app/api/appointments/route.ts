import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeEndTime } from "@/lib/availability";
import {
  cancelAppointmentByClient,
  createAppointment,
  getShopBundle,
  listAppointments,
  rescheduleAppointmentByClient,
  updateAppointmentStatus,
} from "@/lib/data";
import { getRequestSession, requirePermission } from "@/lib/auth";
import { opsStore } from "@/lib/ops-store";
import { onlyDigits } from "@/lib/utils";
import {
  buildClientConfirmationMessage,
  buildWhatsAppConfirmUrl,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";

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

    const confirmPayload = {
      shopName: bundle.shop.name,
      shopPhone: bundle.shop.phone,
      clientName: body.client_name,
      barberName: barber.name,
      serviceName: service.name,
      dateLabel,
      time: body.start_time,
      price: service.price,
    };

    const whatsappUrl = buildWhatsAppConfirmUrl(confirmPayload);
    const clientMessage = buildClientConfirmationMessage(confirmPayload);
    const delivery = await sendWhatsAppMessage({
      toPhone: body.client_phone,
      message: clientMessage,
      fallbackShopPhone: bundle.shop.phone,
    });

    return NextResponse.json({
      appointment,
      whatsappUrl: delivery.url || whatsappUrl,
      confirmation: delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao agendar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === "client_cancel") {
      const data = z
        .object({
          id: z.string().uuid(),
          phone: z.string().min(10),
        })
        .parse(body);
      const appointment = await cancelAppointmentByClient(data.id, data.phone);
      return NextResponse.json({ appointment });
    }

    if (action === "client_reschedule") {
      const data = z
        .object({
          id: z.string().uuid(),
          phone: z.string().min(10),
          appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          start_time: z.string().regex(/^\d{2}:\d{2}$/),
        })
        .parse(body);
      const appointment = await rescheduleAppointmentByClient(data);
      return NextResponse.json({ appointment });
    }

    const session = getRequestSession(req);
    requirePermission(session, "mark_status");

    const data = z
      .object({
        id: z.string().uuid(),
        status: z.enum(["confirmed", "completed", "canceled", "no_show"]),
      })
      .parse(body);

    const appointment = await updateAppointmentStatus(data.id, data.status);

    let sale = null;
    if (data.status === "completed") {
      try {
        const bundle = await getShopBundle(
          req.nextUrl.searchParams.get("slug") ?? "navalha-negra",
        );
        const service = bundle?.services.find((s) => s.id === appointment.service_id);
        if (service) {
          // tenta consumir crédito de pacote do cliente
          const snap = opsStore.snapshot();
          const clientPkg = snap.clientPackages.find(
            (p) =>
              p.status === "active" &&
              p.credits_left > 0 &&
              appointment.client_id === p.client_id,
          );
          if (clientPkg) {
            opsStore.consumePackageCredit(clientPkg.id);
          } else {
            if (!opsStore.currentCash()) {
              opsStore.openCash({
                opened_by: session?.full_name || "sistema",
                opening_amount: 0,
                notes: "Abertura automática ao concluir atendimento",
              });
            }
            sale = opsStore.createSale({
              created_by: session?.full_name || "sistema",
              client_id: appointment.client_id,
              client_name: appointment.client_name,
              barber_id: appointment.barber_id,
              appointment_id: appointment.id,
              items: [
                {
                  kind: "service",
                  ref_id: service.id,
                  description: service.name,
                  quantity: 1,
                  unit_price: service.price,
                },
              ],
              payments: [{ method: "pix", amount: service.price }],
            });
          }
        }
      } catch {
        // não bloqueia conclusão se PDV falhar
      }
    }

    return NextResponse.json({ appointment, sale });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
