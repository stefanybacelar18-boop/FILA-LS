import { randomUUID } from "crypto";
import type {
  Appointment,
  Barber,
  Barbershop,
  LoyaltyAccount,
  Reminder,
  Service,
  ShopBundle,
  WorkingHours,
} from "@/lib/types";
import { computeEndTime } from "@/lib/availability";
import { onlyDigits } from "@/lib/utils";

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
};

const globalForDemo = globalThis as typeof globalThis & {
  __cortelyDemoV2?: CatalogState;
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

  return {
    shop,
    barbers,
    services,
    workingHours,
    appointments: [],
    loyaltyAccounts: [],
    reminders: [],
  };
}

function state(): CatalogState {
  if (!globalForDemo.__cortelyDemoV2) {
    globalForDemo.__cortelyDemoV2 = seedState();
  }
  return globalForDemo.__cortelyDemoV2;
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
    `Amanhã/em breve você tem horário na ${s.shop.name}.`,
    `Serviço: ${service?.name ?? "—"}`,
    `Barbeiro: ${barber?.name ?? "—"}`,
    `Data: ${appointment.appointment_date} às ${appointment.start_time}`,
    `Se precisar remarcar, responda esta mensagem.`,
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
    created_at: new Date().toISOString(),
  });
}

export const demoStore = {
  isDemo: true as const,

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
  }) {
    const s = state();
    const service = s.services.find((svc) => svc.id === input.service_id);
    if (!service) throw new Error("Serviço não encontrado");

    const end_time = computeEndTime(input.start_time, service.duration_minutes);
    const row: Appointment = {
      id: randomUUID(),
      barbershop_id: input.barbershop_id,
      barber_id: input.barber_id,
      service_id: input.service_id,
      client_name: input.client_name.trim(),
      client_phone: onlyDigits(input.client_phone),
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      end_time,
      status: "confirmed",
      notes: null,
      created_at: new Date().toISOString(),
    };
    s.appointments.push(row);
    scheduleReminder(row);
    return { ...row };
  },

  updateAppointmentStatus(id: string, status: Appointment["status"]) {
    const row = state().appointments.find((a) => a.id === id);
    if (!row) throw new Error("Agendamento não encontrado");
    row.status = status;

    if (status === "completed") {
      this.addLoyaltyPoint({
        barbershopId: row.barbershop_id,
        clientPhone: row.client_phone,
        clientName: row.client_name,
        appointmentId: row.id,
      });
      const reminder = state().reminders.find((r) => r.appointment_id === id);
      if (reminder && reminder.status === "pending") reminder.status = "skipped";
    }

    if (status === "canceled") {
      const reminder = state().reminders.find((r) => r.appointment_id === id);
      if (reminder && reminder.status === "pending") reminder.status = "skipped";
    }

    return { ...row };
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
    });
    return { ...s.shop };
  },

  dashboard(barbershopId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const s = state();
    const todayAppointments = s.appointments.filter(
      (a) =>
        a.barbershop_id === barbershopId &&
        a.appointment_date === today &&
        a.status !== "canceled",
    );
    return {
      todayCount: todayAppointments.length,
      confirmedCount: s.appointments.filter(
        (a) => a.barbershop_id === barbershopId && a.status === "confirmed",
      ).length,
      completedCount: s.appointments.filter(
        (a) => a.barbershop_id === barbershopId && a.status === "completed",
      ).length,
      loyaltyClients: s.loyaltyAccounts.filter(
        (a) => a.barbershop_id === barbershopId,
      ).length,
      pendingReminders: s.reminders.filter(
        (r) => r.barbershop_id === barbershopId && r.status === "pending",
      ).length,
      appointments: this.listAppointments({ barbershopId }).sort((a, b) =>
        `${b.appointment_date}${b.start_time}`.localeCompare(
          `${a.appointment_date}${a.start_time}`,
        ),
      ),
    };
  },
};
