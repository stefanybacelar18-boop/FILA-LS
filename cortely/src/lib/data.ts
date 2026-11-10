import { demoStore } from "@/lib/demo-store";
import type { Appointment, ShopBundle } from "@/lib/types";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";

export async function getShopBundle(slug: string): Promise<ShopBundle | null> {
  if (isDemoMode()) {
    return demoStore.getShopBySlug(slug);
  }

  const supabase = createServiceClient();
  const { data: shop, error } = await supabase
    .from("barbershops")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !shop) return null;

  const [{ data: barbers }, { data: services }, { data: workingHours }] =
    await Promise.all([
      supabase
        .from("barbers")
        .select("*")
        .eq("barbershop_id", shop.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("services")
        .select("*")
        .eq("barbershop_id", shop.id)
        .order("price"),
      supabase.from("working_hours").select("*"),
    ]);

  const barberIds = new Set((barbers ?? []).map((b) => b.id));

  return {
    shop,
    barbers: barbers ?? [],
    services: (services ?? []).map((s) => ({
      ...s,
      price: Number(s.price),
      gallery_urls: s.gallery_urls ?? [],
    })),
    workingHours: (workingHours ?? []).filter((w) => barberIds.has(w.barber_id)),
  };
}

export async function listAppointments(params: {
  barbershopId: string;
  barberId?: string;
  date?: string;
}): Promise<Appointment[]> {
  if (isDemoMode()) {
    return demoStore.listAppointments(params);
  }

  const supabase = createServiceClient();
  let query = supabase
    .from("appointments")
    .select("*")
    .eq("barbershop_id", params.barbershopId);

  if (params.barberId) query = query.eq("barber_id", params.barberId);
  if (params.date) query = query.eq("appointment_date", params.date);

  const { data } = await query.order("start_time");
  return data ?? [];
}

export async function createAppointment(input: {
  barbershop_id: string;
  barber_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
}) {
  if (isDemoMode()) {
    return demoStore.createAppointment(input);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...input,
      status: "confirmed",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"],
) {
  if (isDemoMode()) {
    return demoStore.updateAppointmentStatus(id, status);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (status === "completed" && data) {
    await upsertLoyaltyOnComplete({
      barbershopId: data.barbershop_id,
      clientPhone: data.client_phone,
      clientName: data.client_name,
      appointmentId: data.id,
    });
  }

  return data as Appointment;
}

async function upsertLoyaltyOnComplete(input: {
  barbershopId: string;
  clientPhone: string;
  clientName: string;
  appointmentId: string;
}) {
  const supabase = createServiceClient();
  const { data: shop } = await supabase
    .from("barbershops")
    .select("loyalty_threshold")
    .eq("id", input.barbershopId)
    .single();

  const { data: existing } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", input.barbershopId)
    .eq("client_phone", input.clientPhone)
    .maybeSingle();

  let points = (existing?.points ?? 0) + 1;
  const total_visits = (existing?.total_visits ?? 0) + 1;
  const threshold = shop?.loyalty_threshold ?? 5;
  if (points >= threshold) points = 0;

  if (existing) {
    await supabase
      .from("loyalty_accounts")
      .update({
        points,
        total_visits,
        client_name: input.clientName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    await supabase.from("loyalty_events").insert({
      loyalty_account_id: existing.id,
      appointment_id: input.appointmentId,
      delta: 1,
      reason: "atendimento_concluido",
    });
  } else {
    const { data: created } = await supabase
      .from("loyalty_accounts")
      .insert({
        barbershop_id: input.barbershopId,
        client_phone: input.clientPhone,
        client_name: input.clientName,
        points,
        total_visits,
      })
      .select("*")
      .single();

    if (created) {
      await supabase.from("loyalty_events").insert({
        loyalty_account_id: created.id,
        appointment_id: input.appointmentId,
        delta: 1,
        reason: "atendimento_concluido",
      });
    }
  }
}

export async function getDashboard(barbershopId: string) {
  if (isDemoMode()) {
    return demoStore.dashboard(barbershopId);
  }

  const appointments = await listAppointments({ barbershopId });
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createServiceClient();
  const { data: loyalty } = await supabase
    .from("loyalty_accounts")
    .select("id")
    .eq("barbershop_id", barbershopId);

  return {
    todayCount: appointments.filter(
      (a) => a.appointment_date === today && a.status !== "canceled",
    ).length,
    confirmedCount: appointments.filter((a) => a.status === "confirmed").length,
    completedCount: appointments.filter((a) => a.status === "completed").length,
    loyaltyClients: loyalty?.length ?? 0,
    appointments,
  };
}

export async function listLoyalty(barbershopId: string) {
  if (isDemoMode()) {
    return demoStore.listLoyalty(barbershopId);
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("points", { ascending: false });

  return data ?? [];
}

export async function getLoyalty(barbershopId: string, phone: string) {
  if (isDemoMode()) {
    return demoStore.getLoyalty(barbershopId, phone);
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .eq("client_phone", phone)
    .maybeSingle();

  return data;
}

export function demoShopId() {
  return "11111111-1111-4111-8111-111111111111";
}
