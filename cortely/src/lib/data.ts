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
  WorkingHours,
} from "@/lib/types";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import { onlyDigits } from "@/lib/utils";
import { getWhatsAppDeliveryMode } from "@/lib/whatsapp";

function mapShop(shop: Barbershop & { cancel_hours_before?: number }) {
  return {
    ...shop,
    reminder_hours_before: shop.reminder_hours_before ?? 24,
    cancel_hours_before: shop.cancel_hours_before ?? 2,
  };
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
    shop: mapShop(shop),
    barbers: barbers ?? [],
    services: (services ?? []).map((s) => ({
      ...s,
      price: Number(s.price),
      gallery_urls: s.gallery_urls ?? [],
    })),
    workingHours: (workingHours ?? []).filter((w) => barberIds.has(w.barber_id)),
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
  throw new Error("Cancelamento self-service via Supabase: ative o DEMO ou complete o fluxo Auth");
}

export async function rescheduleAppointmentByClient(input: {
  id: string;
  phone: string;
  appointment_date: string;
  start_time: string;
}) {
  if (isDemoMode()) return demoStore.rescheduleAppointmentByClient(input);
  throw new Error("Reagendamento self-service via Supabase: ative o DEMO ou complete o fluxo Auth");
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
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createServiceClient();
  const [{ data: loyalty }, { data: reminders }, { data: clients }] =
    await Promise.all([
      supabase.from("loyalty_accounts").select("id").eq("barbershop_id", barbershopId),
      supabase
        .from("reminders")
        .select("id")
        .eq("barbershop_id", barbershopId)
        .eq("status", "pending"),
      supabase.from("clients").select("last_visit_at,total_visits,barbershop_id"),
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

export async function markReminderSent(id: string) {
  if (isDemoMode()) return demoStore.markReminderSent(id);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "sent" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Reminder;
}

export async function markReminderFailed(id: string) {
  if (isDemoMode()) return demoStore.markReminderFailed(id);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({ status: "failed" })
    .eq("id", id)
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

export async function deleteScheduleBlock(id: string) {
  if (isDemoMode()) return demoStore.deleteScheduleBlock(id);
  const supabase = createServiceClient();
  const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
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
}): Promise<Barber> {
  if (isDemoMode()) return demoStore.upsertBarber(input);

  const supabase = createServiceClient();
  if (input.id) {
    const { data, error } = await supabase
      .from("barbers")
      .update({
        name: input.name,
        specialties: input.specialties,
        avatar_url: input.avatar_url,
        is_active: input.is_active,
      })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Barber;
  }

  throw new Error("Criação de barbeiro via Supabase exige barbershop_id no payload");
}

export async function upsertService(input: {
  id?: string;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  category?: string;
  gallery_urls?: string[];
}): Promise<Service> {
  if (isDemoMode()) return demoStore.upsertService(input);
  throw new Error("CRUD serviço via Supabase: configure o DEMO ou complete o admin SQL");
}

export async function deleteService(id: string) {
  if (isDemoMode()) return demoStore.deleteService(id);
  const supabase = createServiceClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setWorkingHours(
  barberId: string,
  rows: Omit<WorkingHours, "id" | "barber_id">[],
) {
  if (isDemoMode()) return demoStore.setWorkingHours(barberId, rows);
  throw new Error("Horários via Supabase: use o DEMO ou o painel SQL");
}

export async function updateShopSettings(input: Partial<Barbershop>) {
  if (isDemoMode()) return demoStore.updateShopSettings(input);
  throw new Error("Configurações via Supabase: use o DEMO ou o painel SQL");
}
