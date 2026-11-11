import { NextRequest, NextResponse } from "next/server";
import { buildAvailableSlots } from "@/lib/availability";
import { getShopBundle, listAppointments, listScheduleBlocks } from "@/lib/data";
import { shopTodayISO, timeToMinutes } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const barberId = req.nextUrl.searchParams.get("barberId");
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const date = req.nextUrl.searchParams.get("date");
  const suggest = req.nextUrl.searchParams.get("suggest") === "1";
  const occupancy = req.nextUrl.searchParams.get("occupancy") === "1";

  if (!slug || !serviceId || !date) {
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

  const holidays = bundle.shop.holidays ?? [];
  if (holidays.includes(date)) {
    return NextResponse.json({
      slots: [],
      booking_link_enabled: bundle.shop.booking_link_enabled ?? true,
      holiday: true,
      suggestions: [],
      occupancy: null,
    });
  }

  const allowed = bundle.shop.booking_barber_ids ?? [];
  const barbers = bundle.barbers.filter(
    (b) => allowed.length === 0 || allowed.includes(b.id),
  );

  async function slotsForBarber(id: string) {
    const [appointments, scheduleBlocks] = await Promise.all([
      listAppointments({
        barbershopId: bundle!.shop.id,
        barberId: id,
        date: date!,
      }),
      listScheduleBlocks({
        barbershopId: bundle!.shop.id,
        barberId: id,
        date: date!,
      }),
    ]);
    return {
      appointments,
      slots: buildAvailableSlots({
        workingHours: bundle!.workingHours.filter((w) => w.barber_id === id),
        appointments,
        scheduleBlocks,
        dateISO: date!,
        durationMinutes: service!.duration_minutes,
        slotStepMinutes: bundle!.shop.booking_slot_minutes ?? 30,
      }),
    };
  }

  if (occupancy) {
    const dayStats = await Promise.all(
      barbers.map(async (b) => {
        const { appointments, slots } = await slotsForBarber(b.id);
        const booked = appointments.filter(
          (a) => a.status !== "canceled" && a.status !== "no_show",
        ).length;
        const idleMinutes = slots.length * (bundle.shop.booking_slot_minutes ?? 30);
        return {
          barber_id: b.id,
          barber_name: b.name,
          booked,
          open_slots: slots.length,
          idle_minutes: idleMinutes,
          next_slots: slots.slice(0, 4),
        };
      }),
    );
    const totalOpen = dayStats.reduce((a, d) => a + d.open_slots, 0);
    const totalBooked = dayStats.reduce((a, d) => a + d.booked, 0);
    return NextResponse.json({
      date,
      occupancy: {
        shop_open_slots: totalOpen,
        shop_booked: totalBooked,
        fill_ratio:
          totalOpen + totalBooked > 0
            ? Math.round((totalBooked / (totalOpen + totalBooked)) * 100)
            : 0,
        by_barber: dayStats,
        idle_highlights: dayStats
          .filter((d) => d.open_slots >= 3)
          .sort((a, b) => b.open_slots - a.open_slots)
          .slice(0, 5),
      },
    });
  }

  if (!barberId && !suggest) {
    return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
  }

  if (suggest || !barberId) {
    const suggestions: Array<{
      barber_id: string;
      barber_name: string;
      slots: string[];
      score: number;
    }> = [];
    for (const b of barbers) {
      const { slots } = await slotsForBarber(b.id);
      if (!slots.length) continue;
      // Prefer earlier slots and more availability
      const earliest = timeToMinutes(slots[0]);
      const score = slots.length * 10 - earliest / 60;
      suggestions.push({
        barber_id: b.id,
        barber_name: b.name,
        slots: slots.slice(0, 6),
        score,
      });
    }
    suggestions.sort((a, b) => b.score - a.score);
    const primary = barberId
      ? suggestions.find((s) => s.barber_id === barberId)
      : suggestions[0];
    return NextResponse.json({
      slots: primary?.slots ?? [],
      booking_link_enabled: bundle.shop.booking_link_enabled ?? true,
      suggestions: suggestions.slice(0, 5),
      suggested_barber_id: suggestions[0]?.barber_id ?? null,
      today: shopTodayISO(),
    });
  }

  if (allowed.length > 0 && !allowed.includes(barberId)) {
    return NextResponse.json({
      slots: [],
      booking_link_enabled: bundle.shop.booking_link_enabled ?? true,
      error: "Profissional não disponível no agendamento online",
    });
  }

  const { slots } = await slotsForBarber(barberId);
  const alternatives = [];
  for (const b of barbers.filter((x) => x.id !== barberId).slice(0, 4)) {
    const alt = await slotsForBarber(b.id);
    if (alt.slots.length) {
      alternatives.push({
        barber_id: b.id,
        barber_name: b.name,
        slots: alt.slots.slice(0, 4),
      });
    }
  }

  return NextResponse.json({
    slots,
    booking_link_enabled: bundle.shop.booking_link_enabled ?? true,
    alternatives,
  });
}
