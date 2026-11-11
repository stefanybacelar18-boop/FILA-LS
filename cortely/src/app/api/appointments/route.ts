import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildAvailableSlots, computeEndTime } from "@/lib/availability";
import {
  cancelAppointmentByClient,
  createAppointment,
  getAppointment,
  getShopBundle,
  listAppointments,
  listScheduleBlocks,
  rescheduleAppointmentByClient,
  updateAppointmentStatus,
} from "@/lib/data";
import {
  getRequestSession,
  parseClientProof,
  requirePermission,
} from "@/lib/auth";
import { opsStore } from "@/lib/ops-store";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
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

    const appointments = await listAppointments({
      barbershopId: bundle.shop.id,
      barberId:
        session!.role === "barber"
          ? session!.barber_id ?? undefined
          : undefined,
    });
    return NextResponse.json({
      appointments,
      barbers: bundle.barbers,
      services: bundle.services,
      shop: bundle.shop,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro";
    const status = message.includes("login") || message.includes("permissão")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

const createPublicSchema = createSchema.extend({
  client_token: z.string().min(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const limited = checkRateLimit(`book:${ip === "unknown" ? "untrusted" : ip}`, {
      limit: ip === "unknown" ? 5 : 15,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: limited.error, retryAfterSec: limited.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const body = createPublicSchema.parse(await req.json());
    const phoneDigits = onlyDigits(body.client_phone);
    const staff = getRequestSession(req);
    const staffCanBook = Boolean(
      staff &&
        (staff.role === "owner" ||
          staff.role === "reception" ||
          staff.role === "barber"),
    );
    const clientOk = Boolean(
      body.client_token && parseClientProof(body.client_token, phoneDigits),
    );
    // OTP obrigatório só com WhatsApp Business API configurada.
    const otpRequired = Boolean(process.env.WHATSAPP_API_TOKEN?.trim());
    if (!staffCanBook && !clientOk && otpRequired) {
      return NextResponse.json(
        {
          error:
            "Confirme o WhatsApp com o código OTP antes de agendar (ou entre como equipe).",
        },
        { status: 401 },
      );
    }

    const bundle = await getShopBundle(body.slug);
    if (!bundle) {
      return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
    }
    if (staffCanBook && staff!.barbershop_id !== bundle.shop.id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    if (!staffCanBook && bundle.shop.booking_link_enabled === false) {
      return NextResponse.json(
        { error: "Agendamento online está pausado nesta barbearia" },
        { status: 403 },
      );
    }

    const barber = bundle.barbers.find((b) => b.id === body.barber_id);
    const service = bundle.services.find((s) => s.id === body.service_id);
    if (!barber || !service) {
      return NextResponse.json({ error: "Barbeiro ou serviço inválido" }, { status: 400 });
    }

    if (!staffCanBook) {
      const holidays = bundle.shop.holidays ?? [];
      if (holidays.includes(body.appointment_date)) {
        return NextResponse.json(
          { error: "Data indisponível (feriado)" },
          { status: 400 },
        );
      }
      const allowed = bundle.shop.booking_barber_ids ?? [];
      if (allowed.length > 0 && !allowed.includes(body.barber_id)) {
        return NextResponse.json(
          { error: "Profissional indisponível no agendamento online" },
          { status: 400 },
        );
      }
      const [dayAppts, dayBlocks] = await Promise.all([
        listAppointments({
          barbershopId: bundle.shop.id,
          barberId: body.barber_id,
          date: body.appointment_date,
        }),
        listScheduleBlocks({
          barbershopId: bundle.shop.id,
          barberId: body.barber_id,
          date: body.appointment_date,
        }),
      ]);
      const free = buildAvailableSlots({
        workingHours: bundle.workingHours.filter((w) => w.barber_id === body.barber_id),
        appointments: dayAppts,
        scheduleBlocks: dayBlocks,
        dateISO: body.appointment_date,
        durationMinutes: service.duration_minutes,
        slotStepMinutes: bundle.shop.booking_slot_minutes ?? 30,
      });
      if (!free.includes(body.start_time.slice(0, 5))) {
        return NextResponse.json(
          { error: "Horário indisponível. Escolha outro." },
          { status: 409 },
        );
      }
    }

    // Nome sanitizado — evita texto livre em mensagens WhatsApp
    const clientName = body.client_name
      .trim()
      .slice(0, 80)
      .replace(/[^\w\s.'-]/g, "");

    const appointment = await createAppointment({
      barbershop_id: bundle.shop.id,
      barber_id: body.barber_id,
      service_id: body.service_id,
      client_name: clientName || "Cliente",
      client_phone: phoneDigits,
      appointment_date: body.appointment_date,
      start_time: body.start_time,
      end_time: computeEndTime(body.start_time, service.duration_minutes),
    });

    const dateLabel = new Date(`${body.appointment_date}T12:00:00`).toLocaleDateString(
      "pt-BR",
      { weekday: "long", day: "2-digit", month: "long" },
    );

    // Só wa.me para a loja (template fixo). Sem envio API anônimo a números arbitrários.
    const whatsappUrl = buildWhatsAppConfirmUrl({
      shopName: bundle.shop.name,
      shopPhone: bundle.shop.phone,
      clientName: appointment.client_name,
      barberName: barber.name,
      serviceName: service.name,
      dateLabel,
      time: body.start_time,
      price: service.price,
    });

    return NextResponse.json({
      appointment,
      whatsappUrl,
      confirmation: { ok: true, mode: "manual" as const, url: whatsappUrl },
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
          client_token: z.string().min(20),
        })
        .parse(body);
      const digits = onlyDigits(data.phone);
      if (!parseClientProof(data.client_token, digits)) {
        return NextResponse.json(
          { error: "Verifique o WhatsApp com OTP para cancelar" },
          { status: 401 },
        );
      }
      const appointment = await cancelAppointmentByClient(data.id, digits);
      return NextResponse.json({ appointment });
    }

    if (action === "client_reschedule") {
      const data = z
        .object({
          id: z.string().uuid(),
          phone: z.string().min(10),
          client_token: z.string().min(20),
          appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          start_time: z.string().regex(/^\d{2}:\d{2}$/),
        })
        .parse(body);
      const digits = onlyDigits(data.phone);
      if (!parseClientProof(data.client_token, digits)) {
        return NextResponse.json(
          { error: "Verifique o WhatsApp com OTP para reagendar" },
          { status: 401 },
        );
      }
      const appointment = await rescheduleAppointmentByClient({
        ...data,
        phone: digits,
      });
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

    const current = await getAppointment(data.id);
    if (!current) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404 },
      );
    }
    if (current.barbershop_id !== session!.barbershop_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    if (
      session!.role === "barber" &&
      session!.barber_id &&
      current.barber_id !== session!.barber_id
    ) {
      return NextResponse.json(
        { error: "Só pode alterar a própria agenda" },
        { status: 403 },
      );
    }

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
