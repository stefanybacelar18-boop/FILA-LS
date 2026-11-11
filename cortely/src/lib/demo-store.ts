import { randomUUID } from "crypto";
import type {
  Appointment,
  Barber,
  Barbershop,
  Client,
  LoyaltyAccount,
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
import { loadPersistedStore, persistDemo } from "@/lib/persist";
import { onlyDigits } from "@/lib/utils";
import {
  expectedPasswordForRole,
  passwordsMatch,
} from "@/lib/staff-passwords";
import { getWhatsAppDeliveryMode } from "@/lib/whatsapp";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";

function avatar(name: string) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}&backgroundColor=1c1917`;
}

function gallery(seed: string) {
  return [
    `https://picsum.photos/seed/${seed}a/640/480`,
    `https://picsum.photos/seed/${seed}b/640/480`,
  ];
}

type CatalogState = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  workingHours: WorkingHours[];
  appointments: Appointment[];
  loyaltyAccounts: LoyaltyAccount[];
  reminders: Reminder[];
  clients: Client[];
  scheduleBlocks: ScheduleBlock[];
  staff: StaffUser[];
};

const globalForDemo = globalThis as typeof globalThis & {
  __cortelyDemoV4?: CatalogState;
};

function seedState(): CatalogState {
  const shop: Barbershop = {
    id: SHOP_ID,
    name: "Navalha Negra",
    slug: "navalha-negra",
    phone: "11999998888",
    logo_url: null,
    banner_url: "https://picsum.photos/seed/cortely-banner/1400/500",
    address: "Rua Augusta, 1200 — São Paulo, SP",
    primary_color: "#d97706",
    loyalty_threshold: 5,
    loyalty_reward: "6º corte com 50% de desconto",
    reminder_hours_before: 24,
    cancel_hours_before: 2,
    created_at: new Date().toISOString(),
  };

  const barbers: Barber[] = [
    {
      id: "22222222-2222-4222-8222-222222222221",
      barbershop_id: SHOP_ID,
      name: "Rafael Costa",
      avatar_url: avatar("Rafael Costa"),
      specialties: ["Fade", "Barba"],
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      barbershop_id: SHOP_ID,
      name: "Diego Santos",
      avatar_url: avatar("Diego Santos"),
      specialties: ["Social", "Degradê"],
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222223",
      barbershop_id: SHOP_ID,
      name: "Lucas Mendes",
      avatar_url: avatar("Lucas Mendes"),
      specialties: ["Navalhado", "Sobrancelha"],
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ];

  const services: Service[] = [
    {
      id: "33333333-3333-4333-8333-333333333331",
      barbershop_id: SHOP_ID,
      name: "Corte Clássico",
      description: "Máquina + tesoura com acabamento",
      duration_minutes: 40,
      price: 55,
      category: "Cabelo",
      gallery_urls: gallery("corte-classico"),
      created_at: new Date().toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333332",
      barbershop_id: SHOP_ID,
      name: "Corte + Barba",
      description: "Combo completo com toalha quente",
      duration_minutes: 70,
      price: 90,
      category: "Combo",
      gallery_urls: gallery("corte-barba"),
      created_at: new Date().toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      barbershop_id: SHOP_ID,
      name: "Barba Completa",
      description: "Aparar, desenhar e hidratar",
      duration_minutes: 30,
      price: 40,
      category: "Barba",
      gallery_urls: gallery("barba"),
      created_at: new Date().toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333334",
      barbershop_id: SHOP_ID,
      name: "Fade Premium",
      description: "Degradê alto com detalhe navalha",
      duration_minutes: 50,
      price: 70,
      category: "Cabelo",
      gallery_urls: gallery("fade"),
      created_at: new Date().toISOString(),
    },
  ];

  const workingHours: WorkingHours[] = barbers.flatMap((barber) =>
    [1, 2, 3, 4, 5, 6].map((day) => ({
      id: randomUUID(),
      barber_id: barber.id,
      day_of_week: day,
      start_time: "09:00",
      end_time: "19:00",
      break_start: "12:00",
      break_end: "13:00",
    })),
  );

  // IDs de staff gerados no seed (não fixos no código) — impede forjar sessão com UUIDs públicos.
  const staff: StaffUser[] = [
    {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      email: "dono@cortely.demo",
      full_name: "Stefany — Dona",
      role: "owner",
      barber_id: null,
    },
    {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      email: "recepcao@cortely.demo",
      full_name: "Ana — Recepção",
      role: "reception",
      barber_id: null,
    },
    {
      id: randomUUID(),
      barbershop_id: SHOP_ID,
      email: "rafael@cortely.demo",
      full_name: "Rafael Costa",
      role: "barber",
      barber_id: barbers[0].id,
    },
  ];

  return {
    shop,
    barbers,
    services,
    workingHours,
    appointments: [],
    loyaltyAccounts: [],
    reminders: [],
    clients: [],
    scheduleBlocks: [],
    staff,
  };
}

function scrubStaff(staff: StaffUser[]) {
  return staff.map((s) => ({
    id: s.id,
    barbershop_id: s.barbershop_id,
    email: s.email,
    full_name: s.full_name,
    role: s.role,
    barber_id: s.barber_id,
  }));
}

function state(): CatalogState {
  if (!globalForDemo.__cortelyDemoV4) {
    const saved = loadPersistedStore().demo as CatalogState | undefined;
    if (saved?.staff) saved.staff = scrubStaff(saved.staff);
    globalForDemo.__cortelyDemoV4 = saved ?? seedState();
    persistDemo(globalForDemo.__cortelyDemoV4);
  }
  return globalForDemo.__cortelyDemoV4;
}

function commit() {
  persistDemo(state());
}

function upsertClientFromBooking(input: {
  barbershopId: string;
  name: string;
  phone: string;
  preferredBarberId?: string;
}) {
  const s = state();
  const phone = onlyDigits(input.phone);
  let client = s.clients.find(
    (c) => c.barbershop_id === input.barbershopId && c.phone === phone,
  );
  if (!client) {
    client = {
      id: randomUUID(),
      barbershop_id: input.barbershopId,
      full_name: input.name.trim(),
      phone,
      email: null,
      notes: null,
      preferred_barber_id: input.preferredBarberId ?? null,
      birth_date: null,
      last_visit_at: null,
      total_visits: 0,
      no_show_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    s.clients.push(client);
  } else {
    client.full_name = input.name.trim();
    if (input.preferredBarberId) client.preferred_barber_id = input.preferredBarberId;
    client.updated_at = new Date().toISOString();
  }
  return client;
}

function scheduleReminder(appointment: Appointment) {
  const s = state();
  const hours = s.shop.reminder_hours_before || 24;
  const when = new Date(`${appointment.appointment_date}T${appointment.start_time}:00`);
  when.setHours(when.getHours() - hours);

  const barber = s.barbers.find((b) => b.id === appointment.barber_id);
  const service = s.services.find((svc) => svc.id === appointment.service_id);
  const message = [
    `Olá ${appointment.client_name}! Lembrete Cortely:`,
    `Você tem horário na ${s.shop.name}.`,
    `Serviço: ${service?.name ?? "—"}`,
    `Barbeiro: ${barber?.name ?? "—"}`,
    `Data: ${appointment.appointment_date} às ${appointment.start_time}`,
    `Para remarcar/cancelar, use Meus horários no link da barbearia.`,
  ].join("\n");

  s.reminders = s.reminders.filter((r) => r.appointment_id !== appointment.id);
  s.reminders.push({
    id: randomUUID(),
    barbershop_id: appointment.barbershop_id,
    appointment_id: appointment.id,
    client_name: appointment.client_name,
    client_phone: appointment.client_phone,
    scheduled_for: when.toISOString(),
    status: "pending",
    message,
    channel: "whatsapp",
    delivery_mode: getWhatsAppDeliveryMode(),
    created_at: new Date().toISOString(),
  });
}

function assertCancelWindow(appointment: Appointment) {
  const hours = state().shop.cancel_hours_before ?? 2;
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

const READ_ONLY = new Set([
  "isDemo",
  "authenticate",
  "listStaff",
  "getShopBySlug",
  "getCatalog",
  "listAppointments",
  "listClients",
  "listScheduleBlocks",
  "listLoyalty",
  "getLoyalty",
  "listReminders",
  "dueReminders",
  "dashboard",
  "flush",
]);

const demoStoreImpl = {
  isDemo: true as const,

  getStaffById(id: string): StaffUser | null {
    const user = state().staff.find((s) => s.id === id);
    if (!user) return null;
    return {
      id: user.id,
      barbershop_id: user.barbershop_id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      barber_id: user.barber_id,
    };
  },

  authenticate(email: string, password: string): StaffUser | null {
    const user = state().staff.find(
      (s) => s.email === email.trim().toLowerCase(),
    );
    if (!user) return null;
    const expected = expectedPasswordForRole(user.role);
    if (!expected || !passwordsMatch(password, expected)) return null;
    return this.getStaffById(user.id);
  },

  listStaff(barbershopId: string) {
    return state()
      .staff.filter((s) => s.barbershop_id === barbershopId)
      .map((s) => ({
        id: s.id,
        barbershop_id: s.barbershop_id,
        email: s.email,
        full_name: s.full_name,
        role: s.role,
        barber_id: s.barber_id,
      }));
  },

  getShopBySlug(slug: string): ShopBundle | null {
    const s = state();
    if (slug !== s.shop.slug) return null;
    return {
      shop: { ...s.shop },
      barbers: s.barbers.filter((b) => b.is_active).map((b) => ({ ...b })),
      services: s.services.map((svc) => ({ ...svc, gallery_urls: [...svc.gallery_urls] })),
      workingHours: s.workingHours.map((w) => ({ ...w })),
    };
  },

  getCatalog(slug: string) {
    const s = state();
    if (slug !== s.shop.slug) return null;
    return {
      shop: { ...s.shop },
      barbers: s.barbers.map((b) => ({ ...b })),
      services: s.services.map((svc) => ({ ...svc, gallery_urls: [...svc.gallery_urls] })),
      workingHours: s.workingHours.map((w) => ({ ...w })),
    };
  },

  listAppointments(params: {
    barbershopId: string;
    barberId?: string;
    date?: string;
    phone?: string;
  }) {
    return state()
      .appointments.filter((a) => a.barbershop_id === params.barbershopId)
      .filter((a) => (params.barberId ? a.barber_id === params.barberId : true))
      .filter((a) => (params.date ? a.appointment_date === params.date : true))
      .filter((a) =>
        params.phone ? a.client_phone === onlyDigits(params.phone) : true,
      )
      .map((a) => ({ ...a }));
  },

  createAppointment(input: {
    barbershop_id: string;
    barber_id: string;
    service_id: string;
    client_name: string;
    client_phone: string;
    appointment_date: string;
    start_time: string;
    notes?: string | null;
  }) {
    const s = state();
    const service = s.services.find((svc) => svc.id === input.service_id);
    if (!service) throw new Error("Serviço não encontrado");

    const client = upsertClientFromBooking({
      barbershopId: input.barbershop_id,
      name: input.client_name,
      phone: input.client_phone,
      preferredBarberId: input.barber_id,
    });

    const end_time = computeEndTime(input.start_time, service.duration_minutes);
    const row: Appointment = {
      id: randomUUID(),
      barbershop_id: input.barbershop_id,
      barber_id: input.barber_id,
      service_id: input.service_id,
      client_id: client.id,
      client_name: input.client_name.trim(),
      client_phone: onlyDigits(input.client_phone),
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      end_time,
      status: "confirmed",
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    };
    s.appointments.push(row);
    scheduleReminder(row);
    return { ...row };
  },

  getAppointment(id: string) {
    const row = state().appointments.find((a) => a.id === id);
    return row ? { ...row } : null;
  },

  updateAppointmentStatus(id: string, status: Appointment["status"]) {
    const s = state();
    const row = s.appointments.find((a) => a.id === id);
    if (!row) throw new Error("Agendamento não encontrado");
    row.status = status;

    const client = s.clients.find((c) => c.id === row.client_id);

    if (status === "completed") {
      this.addLoyaltyPoint({
        barbershopId: row.barbershop_id,
        clientPhone: row.client_phone,
        clientName: row.client_name,
        appointmentId: row.id,
      });
      if (client) {
        client.total_visits += 1;
        client.last_visit_at = new Date().toISOString();
        client.updated_at = new Date().toISOString();
      }
      const reminder = s.reminders.find((r) => r.appointment_id === id);
      if (reminder && reminder.status === "pending") reminder.status = "skipped";
    }

    if (status === "canceled") {
      const reminder = s.reminders.find((r) => r.appointment_id === id);
      if (reminder && reminder.status === "pending") reminder.status = "skipped";
    }

    if (status === "no_show") {
      if (client) {
        client.no_show_count += 1;
        client.updated_at = new Date().toISOString();
      }
      const reminder = s.reminders.find((r) => r.appointment_id === id);
      if (reminder && reminder.status === "pending") reminder.status = "skipped";
    }

    return { ...row };
  },

  cancelAppointmentByClient(id: string, phone: string) {
    const row = state().appointments.find((a) => a.id === id);
    if (!row) throw new Error("Agendamento não encontrado");
    if (row.client_phone !== onlyDigits(phone)) {
      throw new Error("WhatsApp não confere com este agendamento");
    }
    if (row.status !== "confirmed") {
      throw new Error("Só é possível cancelar agendamentos confirmados");
    }
    assertCancelWindow(row);
    return this.updateAppointmentStatus(id, "canceled");
  },

  rescheduleAppointmentByClient(input: {
    id: string;
    phone: string;
    appointment_date: string;
    start_time: string;
  }) {
    const s = state();
    const row = s.appointments.find((a) => a.id === input.id);
    if (!row) throw new Error("Agendamento não encontrado");
    if (row.client_phone !== onlyDigits(input.phone)) {
      throw new Error("WhatsApp não confere com este agendamento");
    }
    if (row.status !== "confirmed") {
      throw new Error("Só é possível reagendar agendamentos confirmados");
    }
    assertCancelWindow(row);

    const service = s.services.find((svc) => svc.id === row.service_id);
    if (!service) throw new Error("Serviço não encontrado");

    row.appointment_date = input.appointment_date;
    row.start_time = input.start_time;
    row.end_time = computeEndTime(input.start_time, service.duration_minutes);
    scheduleReminder(row);
    return { ...row };
  },

  listClients(barbershopId: string, query?: string) {
    const q = (query ?? "").trim().toLowerCase();
    return state()
      .clients.filter((c) => c.barbershop_id === barbershopId)
      .filter((c) => {
        if (!q) return true;
        return (
          c.full_name.toLowerCase().includes(q) ||
          c.phone.includes(onlyDigits(q)) ||
          (c.notes ?? "").toLowerCase().includes(q)
        );
      })
      .map((c) => ({ ...c }))
      .sort((a, b) => (b.last_visit_at ?? b.created_at).localeCompare(a.last_visit_at ?? a.created_at));
  },

  updateClient(input: {
    id: string;
    notes?: string | null;
    email?: string | null;
    preferred_barber_id?: string | null;
    birth_date?: string | null;
    full_name?: string;
  }) {
    const row = state().clients.find((c) => c.id === input.id);
    if (!row) throw new Error("Cliente não encontrado");
    if (input.notes !== undefined) row.notes = input.notes;
    if (input.email !== undefined) row.email = input.email;
    if (input.preferred_barber_id !== undefined) {
      row.preferred_barber_id = input.preferred_barber_id;
    }
    if (input.birth_date !== undefined) row.birth_date = input.birth_date;
    if (input.full_name !== undefined) row.full_name = input.full_name;
    row.updated_at = new Date().toISOString();
    return { ...row };
  },

  listScheduleBlocks(params: {
    barbershopId: string;
    barberId?: string;
    date?: string;
  }) {
    return state()
      .scheduleBlocks.filter((b) => b.barbershop_id === params.barbershopId)
      .filter((b) => (params.barberId ? b.barber_id === params.barberId : true))
      .filter((b) => (params.date ? b.block_date === params.date : true))
      .map((b) => ({ ...b }))
      .sort((a, b) =>
        `${a.block_date}${a.start_time}`.localeCompare(`${b.block_date}${b.start_time}`),
      );
  },

  createScheduleBlock(input: {
    barbershop_id: string;
    barber_id: string;
    block_date: string;
    start_time: string;
    end_time: string;
    reason?: string | null;
    created_by_role?: StaffRole | "system";
  }) {
    const s = state();
    if (input.start_time >= input.end_time) {
      throw new Error("Horário final deve ser depois do inicial");
    }
    const row: ScheduleBlock = {
      id: randomUUID(),
      barbershop_id: input.barbershop_id,
      barber_id: input.barber_id,
      block_date: input.block_date,
      start_time: input.start_time,
      end_time: input.end_time,
      reason: input.reason ?? null,
      created_by_role: input.created_by_role ?? "system",
      created_at: new Date().toISOString(),
    };
    s.scheduleBlocks.push(row);
    return { ...row };
  },

  getScheduleBlock(id: string) {
    const row = state().scheduleBlocks.find((b) => b.id === id);
    return row ? { ...row } : null;
  },

  deleteScheduleBlock(id: string) {
    const s = state();
    const before = s.scheduleBlocks.length;
    s.scheduleBlocks = s.scheduleBlocks.filter((b) => b.id !== id);
    if (s.scheduleBlocks.length === before) {
      throw new Error("Bloqueio não encontrado");
    }
  },

  listLoyalty(barbershopId: string) {
    return state()
      .loyaltyAccounts.filter((a) => a.barbershop_id === barbershopId)
      .map((a) => ({ ...a }))
      .sort((a, b) => b.points - a.points);
  },

  getLoyalty(barbershopId: string, phone: string) {
    const digits = onlyDigits(phone);
    return (
      state().loyaltyAccounts.find(
        (a) => a.barbershop_id === barbershopId && a.client_phone === digits,
      ) ?? null
    );
  },

  addLoyaltyPoint(input: {
    barbershopId: string;
    clientPhone: string;
    clientName: string;
    appointmentId?: string;
  }) {
    const s = state();
    const phone = onlyDigits(input.clientPhone);
    let account = s.loyaltyAccounts.find(
      (a) => a.barbershop_id === input.barbershopId && a.client_phone === phone,
    );

    if (!account) {
      account = {
        id: randomUUID(),
        barbershop_id: input.barbershopId,
        client_phone: phone,
        client_name: input.clientName,
        points: 0,
        total_visits: 0,
        updated_at: new Date().toISOString(),
      };
      s.loyaltyAccounts.push(account);
    }

    account.points += 1;
    account.total_visits += 1;
    account.client_name = input.clientName;
    account.updated_at = new Date().toISOString();

    if (account.points >= s.shop.loyalty_threshold) {
      account.points = 0;
    }

    return { ...account };
  },

  listReminders(barbershopId: string) {
    return state()
      .reminders.filter((r) => r.barbershop_id === barbershopId)
      .map((r) => ({ ...r }))
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  },

  markReminderSent(id: string) {
    const row = state().reminders.find((r) => r.id === id);
    if (!row) throw new Error("Lembrete não encontrado");
    row.status = "sent";
    return { ...row };
  },

  markReminderFailed(id: string) {
    const row = state().reminders.find((r) => r.id === id);
    if (!row) throw new Error("Lembrete não encontrado");
    row.status = "failed";
    return { ...row };
  },

  dueReminders(now = new Date()) {
    return state()
      .reminders.filter(
        (r) => r.status === "pending" && new Date(r.scheduled_for) <= now,
      )
      .map((r) => ({ ...r }));
  },

  upsertBarber(input: {
    id?: string;
    name: string;
    specialties: string[];
    avatar_url?: string | null;
    is_active?: boolean;
  }) {
    const s = state();
    if (input.id) {
      const row = s.barbers.find((b) => b.id === input.id);
      if (!row) throw new Error("Barbeiro não encontrado");
      row.name = input.name;
      row.specialties = input.specialties;
      if (input.avatar_url !== undefined) row.avatar_url = input.avatar_url;
      if (input.is_active !== undefined) row.is_active = input.is_active;
      return { ...row };
    }

    const row: Barber = {
      id: randomUUID(),
      barbershop_id: s.shop.id,
      name: input.name,
      avatar_url: input.avatar_url ?? avatar(input.name),
      specialties: input.specialties,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    s.barbers.push(row);
    for (const day of [1, 2, 3, 4, 5, 6]) {
      s.workingHours.push({
        id: randomUUID(),
        barber_id: row.id,
        day_of_week: day,
        start_time: "09:00",
        end_time: "19:00",
        break_start: "12:00",
        break_end: "13:00",
      });
    }
    return { ...row };
  },

  upsertService(input: {
    id?: string;
    name: string;
    description?: string;
    duration_minutes: number;
    price: number;
    category?: string;
    gallery_urls?: string[];
  }) {
    const s = state();
    if (input.id) {
      const row = s.services.find((svc) => svc.id === input.id);
      if (!row) throw new Error("Serviço não encontrado");
      row.name = input.name;
      row.description = input.description ?? row.description;
      row.duration_minutes = input.duration_minutes;
      row.price = input.price;
      row.category = input.category ?? row.category;
      if (input.gallery_urls) row.gallery_urls = input.gallery_urls;
      return { ...row, gallery_urls: [...row.gallery_urls] };
    }

    const row: Service = {
      id: randomUUID(),
      barbershop_id: s.shop.id,
      name: input.name,
      description: input.description ?? null,
      duration_minutes: input.duration_minutes,
      price: input.price,
      category: input.category ?? "Geral",
      gallery_urls: input.gallery_urls?.length
        ? input.gallery_urls
        : gallery(input.name.toLowerCase().replace(/\s+/g, "-")),
      created_at: new Date().toISOString(),
    };
    s.services.push(row);
    return { ...row, gallery_urls: [...row.gallery_urls] };
  },

  deleteService(id: string) {
    const s = state();
    s.services = s.services.filter((svc) => svc.id !== id);
  },

  setWorkingHours(barberId: string, rows: Omit<WorkingHours, "id" | "barber_id">[]) {
    const s = state();
    s.workingHours = [
      ...s.workingHours.filter((w) => w.barber_id !== barberId),
      ...rows.map((row) => ({
        id: randomUUID(),
        barber_id: barberId,
        ...row,
      })),
    ];
    return s.workingHours.filter((w) => w.barber_id === barberId).map((w) => ({ ...w }));
  },

  updateShopSettings(input: Partial<Barbershop>) {
    const s = state();
    Object.assign(s.shop, {
      name: input.name ?? s.shop.name,
      phone: input.phone ?? s.shop.phone,
      address: input.address ?? s.shop.address,
      primary_color: input.primary_color ?? s.shop.primary_color,
      banner_url: input.banner_url ?? s.shop.banner_url,
      logo_url: input.logo_url ?? s.shop.logo_url,
      loyalty_threshold: input.loyalty_threshold ?? s.shop.loyalty_threshold,
      loyalty_reward: input.loyalty_reward ?? s.shop.loyalty_reward,
      reminder_hours_before:
        input.reminder_hours_before ?? s.shop.reminder_hours_before,
      cancel_hours_before:
        input.cancel_hours_before ?? s.shop.cancel_hours_before,
    });
    return { ...s.shop };
  },

  /** Persiste estado em disco (.data/cortely-store.json). */
  flush() {
    commit();
  },

  dashboard(barbershopId: string, session?: SessionUser | null) {
    const today = new Date().toISOString().slice(0, 10);
    const s = state();
    let appointments = this.listAppointments({ barbershopId });
    if (session?.role === "barber" && session.barber_id) {
      appointments = appointments.filter((a) => a.barber_id === session.barber_id);
    }

    const todayAppointments = appointments.filter(
      (a) => a.appointment_date === today && a.status !== "canceled",
    );
    return {
      todayCount: todayAppointments.length,
      confirmedCount: appointments.filter((a) => a.status === "confirmed").length,
      completedCount: appointments.filter((a) => a.status === "completed").length,
      noShowCount: appointments.filter((a) => a.status === "no_show").length,
      loyaltyClients: s.loyaltyAccounts.filter(
        (a) => a.barbershop_id === barbershopId,
      ).length,
      pendingReminders: s.reminders.filter(
        (r) => r.barbershop_id === barbershopId && r.status === "pending",
      ).length,
      inactiveClients: s.clients.filter((c) => {
        if (c.barbershop_id !== barbershopId) return false;
        if (!c.last_visit_at) return c.total_visits === 0;
        const days =
          (Date.now() - new Date(c.last_visit_at).getTime()) / (1000 * 60 * 60 * 24);
        return days >= 45;
      }).length,
      appointments: appointments.sort((a, b) =>
        `${b.appointment_date}${b.start_time}`.localeCompare(
          `${a.appointment_date}${a.start_time}`,
        ),
      ),
    };
  },
};

export const demoStore: typeof demoStoreImpl = new Proxy(demoStoreImpl, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    if (READ_ONLY.has(String(prop))) {
      return (...args: unknown[]) => value.apply(target, args);
    }
    return (...args: unknown[]) => {
      const result = value.apply(target, args);
      commit();
      return result;
    };
  },
});
