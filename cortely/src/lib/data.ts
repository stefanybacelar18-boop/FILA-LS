import { demoStore } from "@/lib/demo-store";
import type {
  Appointment,
  Barber,
  Barbershop,
  Client,
  Reminder,
  ScheduleBlock,
  Service,
  SessionUser,
  ShopBundle,
  StaffRole,
  StaffUser,
  WorkingHours,
} from "@/lib/types";
import { computeEndTime } from "@/lib/availability";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import { onlyDigits, shopTodayISO } from "@/lib/utils";
import { getWhatsAppDeliveryMode } from "@/lib/whatsapp";

function mapShop(shop: Barbershop & { cancel_hours_before?: number }) {
  return {
    ...shop,
    reminder_hours_before: shop.reminder_hours_before ?? 24,
    cancel_hours_before: shop.cancel_hours_before ?? 2,
    booking_link_enabled: shop.booking_link_enabled ?? true,
    booking_slot_minutes: shop.booking_slot_minutes ?? 30,
    booking_show_prices: shop.booking_show_prices ?? true,
    booking_group_by_category: shop.booking_group_by_category ?? false,
    booking_barber_ids: shop.booking_barber_ids ?? [],
    holidays: shop.holidays ?? [],
  };
}

function assertCancelWindowHours(
  appointment: Pick<Appointment, "appointment_date" | "start_time">,
  hours: number,
) {
  const when = new Date(
    `${appointment.appointment_date}T${appointment.start_time}:00`,
  );
  const diffHours = (when.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours < hours) {
    throw new Error(
      `Cancelamento/reagendamento só com pelo menos ${hours}h de antecedência`,
    );
  }
}

async function addLoyaltyPointSql(input: {
  barbershopId: string;
  clientPhone: string;
  clientName: string;
  appointmentId?: string;
  threshold: number;
}) {
  const supabase = createServiceClient();
  const phone = onlyDigits(input.clientPhone);
  const { data: existing } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", input.barbershopId)
    .eq("client_phone", phone)
    .maybeSingle();

  const nextPoints = ((existing?.points as number | undefined) ?? 0) + 1;
  const wrapped =
    input.threshold > 0 && nextPoints >= input.threshold ? 0 : nextPoints;
  const totalVisits = ((existing?.total_visits as number | undefined) ?? 0) + 1;

  let accountId = existing?.id as string | undefined;
  if (existing) {
    await supabase
      .from("loyalty_accounts")
      .update({
        points: wrapped,
        total_visits: totalVisits,
        client_name: input.clientName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    const { data: created } = await supabase
      .from("loyalty_accounts")
      .insert({
        barbershop_id: input.barbershopId,
        client_phone: phone,
        client_name: input.clientName,
        points: wrapped,
        total_visits: totalVisits,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    accountId = created?.id;
  }

  if (accountId) {
    await supabase.from("loyalty_events").insert({
      loyalty_account_id: accountId,
      appointment_id: input.appointmentId ?? null,
      delta: 1,
      reason: "visit_completed",
    });
  }
}

export async function getShopBundle(slug: string): Promise<ShopBundle | null> {
  if (isDemoMode()) return demoStore.getShopBySlug(slug);

  const supabase = createServiceClient();
  const { data: shop, error } = await supabase
    .from("barbershops")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !shop) return null;

  const [{ data: barbers }, { data: services }] = await Promise.all([
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
  ]);

  const barberIds = (barbers ?? []).map((b) => b.id as string);
  let workingHours: WorkingHours[] = [];
  if (barberIds.length) {
    const { data: hours } = await supabase
      .from("working_hours")
      .select("*")
      .in("barber_id", barberIds);
    workingHours = (hours ?? []) as WorkingHours[];
  }

  return {
    shop: mapShop(shop),
    barbers: barbers ?? [],
    services: (services ?? []).map((s) => ({
      ...s,
      price: Number(s.price),
      gallery_urls: s.gallery_urls ?? [],
    })),
    workingHours,
  };
}

export async function getAdminCatalog(slug: string) {
  if (isDemoMode()) return demoStore.getCatalog(slug);
  return getShopBundle(slug);
}

export async function listAppointments(params: {
  barbershopId: string;
  barberId?: string;
  date?: string;
  phone?: string;
}): Promise<Appointment[]> {
  if (isDemoMode()) return demoStore.listAppointments(params);

  const supabase = createServiceClient();
  let query = supabase
    .from("appointments")
    .select("*")
    .eq("barbershop_id", params.barbershopId);

  if (params.barberId) query = query.eq("barber_id", params.barberId);
  if (params.date) query = query.eq("appointment_date", params.date);
  if (params.phone) query = query.eq("client_phone", onlyDigits(params.phone));

  const { data } = await query.order("start_time");
  return (data ?? []) as Appointment[];
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
  notes?: string | null;
}) {
  if (isDemoMode()) return demoStore.createAppointment(input);

  const supabase = createServiceClient();
  const phone = onlyDigits(input.client_phone);

  const { data: existingClient } = await supabase
    .from("clients")
    .select("*")
    .eq("barbershop_id", input.barbershop_id)
    .eq("phone", phone)
    .maybeSingle();

  let clientId = existingClient?.id as string | undefined;
  if (!existingClient) {
    const { data: created } = await supabase
      .from("clients")
      .insert({
        barbershop_id: input.barbershop_id,
        full_name: input.client_name.trim(),
        phone,
        preferred_barber_id: input.barber_id,
      })
      .select("*")
      .single();
    clientId = created?.id;
  } else {
    await supabase
      .from("clients")
      .update({
        full_name: input.client_name.trim(),
        preferred_barber_id: input.barber_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingClient.id);
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...input,
      client_phone: phone,
      client_id: clientId ?? null,
      status: "confirmed",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const appointment = data as Appointment;
  const { data: shop } = await supabase
    .from("barbershops")
    .select("*")
    .eq("id", input.barbershop_id)
    .single();

  if (shop) {
    const hours = shop.reminder_hours_before || 24;
    const when = new Date(`${appointment.appointment_date}T${appointment.start_time}:00`);
    when.setHours(when.getHours() - hours);
    await supabase.from("reminders").insert({
      barbershop_id: appointment.barbershop_id,
      appointment_id: appointment.id,
      client_name: appointment.client_name,
      client_phone: appointment.client_phone,
      scheduled_for: when.toISOString(),
      status: "pending",
      message: `Lembrete Cortely: ${appointment.client_name}, horário em ${appointment.appointment_date} às ${appointment.start_time}`,
      channel: "whatsapp",
      delivery_mode: getWhatsAppDeliveryMode(),
    });
  }

  return appointment;
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  if (isDemoMode()) return demoStore.getAppointment(id);

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Appointment | null) ?? null;
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"],
) {
  if (isDemoMode()) return demoStore.updateAppointmentStatus(id, status);

  const supabase = createServiceClient();
  const { data: current, error: findError } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();
  if (findError || !current) throw new Error("Agendamento não encontrado");

  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (status === "completed" && current.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("total_visits")
      .eq("id", current.client_id)
      .single();
    await supabase
      .from("clients")
      .update({
        total_visits: (client?.total_visits ?? 0) + 1,
        last_visit_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.client_id);

    const { data: shop } = await supabase
      .from("barbershops")
      .select("loyalty_threshold")
      .eq("id", current.barbershop_id)
      .maybeSingle();
    await addLoyaltyPointSql({
      barbershopId: current.barbershop_id,
      clientPhone: current.client_phone,
      clientName: current.client_name,
      appointmentId: current.id,
      threshold: shop?.loyalty_threshold ?? 5,
    });
  }

  if (status === "no_show" && current.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("no_show_count")
      .eq("id", current.client_id)
      .single();
    await supabase
      .from("clients")
      .update({
        no_show_count: (client?.no_show_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.client_id);
  }

  if (status === "canceled" || status === "no_show" || status === "completed") {
    await supabase
      .from("reminders")
      .update({ status: "skipped" })
      .eq("appointment_id", id)
      .eq("status", "pending");
  }

  return data as Appointment;
}

export async function cancelAppointmentByClient(id: string, phone: string) {
  if (isDemoMode()) return demoStore.cancelAppointmentByClient(id, phone);

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !row) throw new Error("Agendamento não encontrado");
  if (onlyDigits(row.client_phone) !== onlyDigits(phone)) {
    throw new Error("WhatsApp não confere com este agendamento");
  }
  if (row.status !== "confirmed") {
    throw new Error("Só é possível cancelar agendamentos confirmados");
  }
  const { data: shop } = await supabase
    .from("barbershops")
    .select("cancel_hours_before")
    .eq("id", row.barbershop_id)
    .maybeSingle();
  assertCancelWindowHours(row, shop?.cancel_hours_before ?? 2);
  return updateAppointmentStatus(id, "canceled");
}

export async function rescheduleAppointmentByClient(input: {
  id: string;
  phone: string;
  appointment_date: string;
  start_time: string;
}) {
  if (isDemoMode()) return demoStore.rescheduleAppointmentByClient(input);

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", input.id)
    .single();
  if (error || !row) throw new Error("Agendamento não encontrado");
  if (onlyDigits(row.client_phone) !== onlyDigits(input.phone)) {
    throw new Error("WhatsApp não confere com este agendamento");
  }
  if (row.status !== "confirmed") {
    throw new Error("Só é possível reagendar agendamentos confirmados");
  }
  const { data: shop } = await supabase
    .from("barbershops")
    .select("cancel_hours_before, reminder_hours_before")
    .eq("id", row.barbershop_id)
    .maybeSingle();
  assertCancelWindowHours(row, shop?.cancel_hours_before ?? 2);

  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", row.service_id)
    .single();
  if (!service) throw new Error("Serviço não encontrado");

  const end_time = computeEndTime(
    input.start_time,
    Number(service.duration_minutes),
  );
  const { data, error: updError } = await supabase
    .from("appointments")
    .update({
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      end_time,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (updError) throw new Error(updError.message);

  const appointment = data as Appointment;
  await supabase
    .from("reminders")
    .update({ status: "skipped" })
    .eq("appointment_id", appointment.id)
    .eq("status", "pending");

  const hours = shop?.reminder_hours_before || 24;
  const when = new Date(
    `${appointment.appointment_date}T${appointment.start_time}:00`,
  );
  when.setHours(when.getHours() - hours);
  await supabase.from("reminders").insert({
    barbershop_id: appointment.barbershop_id,
    appointment_id: appointment.id,
    client_name: appointment.client_name,
    client_phone: appointment.client_phone,
    scheduled_for: when.toISOString(),
    status: "pending",
    message: `Lembrete Cortely: ${appointment.client_name}, horário em ${appointment.appointment_date} às ${appointment.start_time}`,
    channel: "whatsapp",
    delivery_mode: getWhatsAppDeliveryMode(),
  });

  return appointment;
}

export async function getDashboard(
  barbershopId: string,
  session?: SessionUser | null,
) {
  if (isDemoMode()) return demoStore.dashboard(barbershopId, session);

  const appointments = await listAppointments({
    barbershopId,
    barberId: session?.role === "barber" ? session.barber_id ?? undefined : undefined,
  });
  const today = shopTodayISO();
  const supabase = createServiceClient();
  const [{ data: loyalty }, { data: reminders }, { data: clients }] =
    await Promise.all([
      supabase.from("loyalty_accounts").select("id").eq("barbershop_id", barbershopId),
      supabase
        .from("reminders")
        .select("id")
        .eq("barbershop_id", barbershopId)
        .eq("status", "pending"),
      supabase
        .from("clients")
        .select("last_visit_at,total_visits,barbershop_id")
        .eq("barbershop_id", barbershopId),
    ]);

  return {
    todayCount: appointments.filter(
      (a) => a.appointment_date === today && a.status !== "canceled",
    ).length,
    confirmedCount: appointments.filter((a) => a.status === "confirmed").length,
    completedCount: appointments.filter((a) => a.status === "completed").length,
    noShowCount: appointments.filter((a) => a.status === "no_show").length,
    loyaltyClients: loyalty?.length ?? 0,
    pendingReminders: reminders?.length ?? 0,
    inactiveClients: (clients ?? []).filter((c) => {
      if (!c.last_visit_at) return (c.total_visits ?? 0) === 0;
      const days =
        (Date.now() - new Date(c.last_visit_at).getTime()) / (1000 * 60 * 60 * 24);
      return days >= 45;
    }).length,
    appointments,
  };
}

export async function listLoyalty(barbershopId: string) {
  if (isDemoMode()) return demoStore.listLoyalty(barbershopId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("points", { ascending: false });
  return data ?? [];
}

export async function getLoyalty(barbershopId: string, phone: string) {
  if (isDemoMode()) return demoStore.getLoyalty(barbershopId, phone);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .eq("client_phone", onlyDigits(phone))
    .maybeSingle();
  return data;
}

export async function listReminders(barbershopId: string): Promise<Reminder[]> {
  if (isDemoMode()) return demoStore.listReminders(barbershopId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("scheduled_for");
  return (data ?? []) as Reminder[];
}

export async function markReminderSent(id: string, barbershopId: string) {
  if (isDemoMode()) return demoStore.markReminderSent(id);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("barbershop_id", barbershopId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Reminder;
}

export async function markReminderFailed(id: string, barbershopId: string) {
  if (isDemoMode()) return demoStore.markReminderFailed(id);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "failed" })
    .eq("id", id)
    .eq("barbershop_id", barbershopId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Reminder;
}

export async function listDueReminders() {
  if (isDemoMode()) return demoStore.dueReminders();
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString());
  return (data ?? []) as Reminder[];
}

export async function listClients(barbershopId: string, query?: string) {
  if (isDemoMode()) return demoStore.listClients(barbershopId, query);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("barbershop_id", barbershopId)
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as Client[];
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (c) =>
      c.full_name.toLowerCase().includes(q) ||
      c.phone.includes(onlyDigits(q)) ||
      (c.notes ?? "").toLowerCase().includes(q),
  );
}

export async function updateClient(input: {
  id: string;
  notes?: string | null;
  email?: string | null;
  preferred_barber_id?: string | null;
  birth_date?: string | null;
  full_name?: string;
  barbershop_id?: string;
}) {
  if (isDemoMode()) return demoStore.updateClient(input);
  const supabase = createServiceClient();
  const { barbershop_id, id, ...patch } = input;
  let query = supabase
    .from("clients")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (barbershop_id) query = query.eq("barbershop_id", barbershop_id);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function listScheduleBlocks(params: {
  barbershopId: string;
  barberId?: string;
  date?: string;
}): Promise<ScheduleBlock[]> {
  if (isDemoMode()) return demoStore.listScheduleBlocks(params);
  const supabase = createServiceClient();
  let query = supabase
    .from("schedule_blocks")
    .select("*")
    .eq("barbershop_id", params.barbershopId);
  if (params.barberId) query = query.eq("barber_id", params.barberId);
  if (params.date) query = query.eq("block_date", params.date);
  const { data } = await query.order("block_date");
  return (data ?? []) as ScheduleBlock[];
}

export async function createScheduleBlock(input: {
  barbershop_id: string;
  barber_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason?: string | null;
  created_by_role?: StaffRole | "system";
}) {
  if (isDemoMode()) return demoStore.createScheduleBlock(input);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("schedule_blocks")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ScheduleBlock;
}

export async function getScheduleBlock(id: string): Promise<ScheduleBlock | null> {
  if (isDemoMode()) return demoStore.getScheduleBlock(id);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("schedule_blocks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as ScheduleBlock | null) ?? null;
}

export async function deleteScheduleBlock(id: string, barbershopId?: string) {
  if (isDemoMode()) return demoStore.deleteScheduleBlock(id);
  if (!barbershopId) {
    throw new Error("barbershop_id obrigatório para excluir bloqueio");
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedule_blocks")
    .delete()
    .eq("id", id)
    .eq("barbershop_id", barbershopId);
  if (error) throw new Error(error.message);
}

export async function listStaff(barbershopId: string) {
  if (isDemoMode()) return demoStore.listStaff(barbershopId);
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, barbershop_id, full_name, role, email, barber_id")
    .eq("barbershop_id", barbershopId);
  return data ?? [];
}

export async function upsertBarber(input: {
  id?: string;
  name: string;
  specialties: string[];
  avatar_url?: string | null;
  is_active?: boolean;
  barbershop_id?: string;
}): Promise<Barber> {
  if (isDemoMode()) return demoStore.upsertBarber(input);

  const supabase = createServiceClient();
  if (input.id) {
    if (!input.barbershop_id) {
      throw new Error("barbershop_id obrigatório para atualizar barbeiro");
    }
    const { data, error } = await supabase
      .from("barbers")
      .update({
        name: input.name,
        specialties: input.specialties,
        avatar_url: input.avatar_url,
        is_active: input.is_active,
      })
      .eq("id", input.id)
      .eq("barbershop_id", input.barbershop_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Barber;
  }

  if (!input.barbershop_id) {
    throw new Error("barbershop_id obrigatório para criar barbeiro");
  }
  const { data, error } = await supabase
    .from("barbers")
    .insert({
      barbershop_id: input.barbershop_id,
      name: input.name,
      specialties: input.specialties,
      avatar_url: input.avatar_url ?? null,
      is_active: input.is_active ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Barber;
}

export async function upsertService(input: {
  id?: string;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  category?: string;
  gallery_urls?: string[];
  barbershop_id?: string;
}): Promise<Service> {
  if (isDemoMode()) return demoStore.upsertService(input);

  const supabase = createServiceClient();
  if (input.id) {
    if (!input.barbershop_id) {
      throw new Error("barbershop_id obrigatório para atualizar serviço");
    }
    const { data, error } = await supabase
      .from("services")
      .update({
        name: input.name,
        description: input.description ?? null,
        duration_minutes: input.duration_minutes,
        price: input.price,
        category: input.category ?? "Geral",
        gallery_urls: input.gallery_urls ?? [],
      })
      .eq("id", input.id)
      .eq("barbershop_id", input.barbershop_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      ...(data as Service),
      price: Number((data as Service).price),
      gallery_urls: (data as Service).gallery_urls ?? [],
    };
  }

  if (!input.barbershop_id) {
    throw new Error("barbershop_id obrigatório para criar serviço");
  }
  const { data, error } = await supabase
    .from("services")
    .insert({
      barbershop_id: input.barbershop_id,
      name: input.name,
      description: input.description ?? null,
      duration_minutes: input.duration_minutes,
      price: input.price,
      category: input.category ?? "Geral",
      gallery_urls: input.gallery_urls ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...(data as Service),
    price: Number((data as Service).price),
    gallery_urls: (data as Service).gallery_urls ?? [],
  };
}

export async function deleteService(id: string, barbershopId?: string) {
  if (isDemoMode()) return demoStore.deleteService(id);
  if (!barbershopId) {
    throw new Error("barbershop_id obrigatório para excluir serviço");
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("barbershop_id", barbershopId);
  if (error) throw new Error(error.message);
}

export async function setWorkingHours(
  barberId: string,
  rows: Omit<WorkingHours, "id" | "barber_id">[],
  barbershopId?: string,
) {
  if (!barbershopId) {
    throw new Error("barbershop_id obrigatório para definir horários");
  }

  if (isDemoMode()) {
    const catalog = await getAdminCatalog("navalha-negra");
    if (!catalog || catalog.shop.id !== barbershopId) {
      throw new Error("Barbeiro não pertence a esta barbearia");
    }
    if (!catalog.barbers.some((b) => b.id === barberId)) {
      throw new Error("Barbeiro não pertence a esta barbearia");
    }
    return demoStore.setWorkingHours(barberId, rows);
  }

  const supabase = createServiceClient();
  const { data: barber, error: barberErr } = await supabase
    .from("barbers")
    .select("id")
    .eq("id", barberId)
    .eq("barbershop_id", barbershopId)
    .maybeSingle();
  if (barberErr) throw new Error(barberErr.message);
  if (!barber) throw new Error("Barbeiro não pertence a esta barbearia");

  const { error: delError } = await supabase
    .from("working_hours")
    .delete()
    .eq("barber_id", barberId);
  if (delError) throw new Error(delError.message);

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from("working_hours")
    .insert(
      rows.map((row) => ({
        barber_id: barberId,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        break_start: row.break_start,
        break_end: row.break_end,
      })),
    )
    .select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkingHours[];
}

export async function updateShopSettings(
  input: Partial<Barbershop> & { id?: string },
) {
  if (isDemoMode()) return demoStore.updateShopSettings(input);

  if (!input.id) {
    throw new Error("id da barbearia obrigatório para atualizar configurações");
  }
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {};
  const keys: (keyof Barbershop)[] = [
    "name",
    "phone",
    "address",
    "primary_color",
    "banner_url",
    "logo_url",
    "loyalty_threshold",
    "loyalty_reward",
    "reminder_hours_before",
    "cancel_hours_before",
    "booking_link_enabled",
    "booking_slot_minutes",
    "booking_show_prices",
    "booking_group_by_category",
    "booking_barber_ids",
    "holidays",
  ];
  for (const key of keys) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  const { data, error } = await supabase
    .from("barbershops")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapShop(data as Barbershop);
}

export async function upsertStaff(input: {
  id?: string;
  email: string;
  full_name: string;
  role: StaffRole;
  barber_id?: string | null;
  barbershop_id: string;
  actorId?: string;
}): Promise<StaffUser> {
  if (isDemoMode()) return demoStore.upsertStaff(input);

  const supabase = createServiceClient();
  const email = input.email.trim().toLowerCase();
  if (input.id) {
    const { data: before } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", input.id)
      .eq("barbershop_id", input.barbershop_id)
      .maybeSingle();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        email,
        full_name: input.full_name,
        role: input.role,
        barber_id: input.barber_id ?? null,
      })
      .eq("id", input.id)
      .eq("barbershop_id", input.barbershop_id)
      .select("id, barbershop_id, full_name, role, email, barber_id")
      .single();
    if (error) throw new Error(error.message);
    if (before && before.role !== input.role) {
      const { revokeStaffSessions, auditPermissionChange } = await import(
        "@/lib/session-revoke"
      );
      revokeStaffSessions({
        staffId: input.id,
        barbershopId: input.barbershop_id,
        reason: `role_changed:${before.role}->${input.role}`,
        actorId: input.actorId,
      });
      auditPermissionChange({
        actorId: input.actorId ?? null,
        barbershopId: input.barbershop_id,
        action: "staff.role_change",
        detail: `${before.role} -> ${input.role} · ${input.id}`,
      });
    }
    return data as StaffUser;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      barbershop_id: input.barbershop_id,
      email,
      full_name: input.full_name,
      role: input.role,
      barber_id: input.barber_id ?? null,
    })
    .select("id, barbershop_id, full_name, role, email, barber_id")
    .single();
  if (error) throw new Error(error.message);
  return data as StaffUser;
}

export async function deleteStaff(
  id: string,
  barbershopId: string,
  actorId?: string,
) {
  if (isDemoMode()) return demoStore.deleteStaff(id, barbershopId, actorId);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)
    .eq("barbershop_id", barbershopId);
  if (error) throw new Error(error.message);
  const { revokeStaffSessions, auditPermissionChange } = await import(
    "@/lib/session-revoke"
  );
  revokeStaffSessions({
    staffId: id,
    barbershopId,
    reason: "staff_deleted",
    actorId,
  });
  auditPermissionChange({
    actorId: actorId ?? null,
    barbershopId,
    action: "staff.delete",
    detail: `profile ${id} removed`,
  });
}
