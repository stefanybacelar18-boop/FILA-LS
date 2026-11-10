import { demoStore } from "@/lib/demo-store";
import type {
  Appointment,
  Barber,
  Barbershop,
  Reminder,
  Service,
  ShopBundle,
  WorkingHours,
} from "@/lib/types";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import { onlyDigits } from "@/lib/utils";

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
    shop: {
      ...shop,
      reminder_hours_before: shop.reminder_hours_before ?? 24,
    },
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
  if (isDemoMode()) return demoStore.createAppointment(input);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...input, status: "confirmed" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"],
) {
  if (isDemoMode()) return demoStore.updateAppointmentStatus(id, status);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

export async function getDashboard(barbershopId: string) {
  if (isDemoMode()) return demoStore.dashboard(barbershopId);

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
    pendingReminders: 0,
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
  return [];
}

export async function markReminderSent(id: string) {
  if (isDemoMode()) return demoStore.markReminderSent(id);
  throw new Error("Lembretes via Supabase ainda não configurados");
}

export async function upsertBarber(input: {
  id?: string;
  name: string;
  specialties: string[];
  avatar_url?: string | null;
  is_active?: boolean;
}): Promise<Barber> {
  if (isDemoMode()) return demoStore.upsertBarber(input);
  throw new Error("CRUD barbeiro via Supabase: use o painel SQL por enquanto");
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
  throw new Error("CRUD serviço via Supabase: use o painel SQL por enquanto");
}

export async function deleteService(id: string) {
  if (isDemoMode()) return demoStore.deleteService(id);
  throw new Error("CRUD serviço via Supabase: use o painel SQL por enquanto");
}

export async function setWorkingHours(
  barberId: string,
  rows: Omit<WorkingHours, "id" | "barber_id">[],
) {
  if (isDemoMode()) return demoStore.setWorkingHours(barberId, rows);
  throw new Error("Horários via Supabase: use o painel SQL por enquanto");
}

export async function updateShopSettings(input: Partial<Barbershop>) {
  if (isDemoMode()) return demoStore.updateShopSettings(input);
  throw new Error("Configurações via Supabase: use o painel SQL por enquanto");
}
