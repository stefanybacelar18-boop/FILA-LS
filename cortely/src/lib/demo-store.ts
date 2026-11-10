import { randomUUID } from "crypto";
import type {
  Appointment,
  Barber,
  Barbershop,
  LoyaltyAccount,
  Service,
  ShopBundle,
  WorkingHours,
} from "@/lib/types";
import { computeEndTime } from "@/lib/availability";
import { onlyDigits } from "@/lib/utils";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";

const shop: Barbershop = {
  id: SHOP_ID,
  name: "Navalha Negra",
  slug: "navalha-negra",
  phone: "11999998888",
  logo_url: null,
  banner_url: null,
  address: "Rua Augusta, 1200 — São Paulo, SP",
  primary_color: "#d97706",
  loyalty_threshold: 5,
  loyalty_reward: "6º corte com 50% de desconto",
  created_at: new Date().toISOString(),
};

const barbers: Barber[] = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    barbershop_id: SHOP_ID,
    name: "Rafael Costa",
    avatar_url: null,
    specialties: ["Fade", "Barba"],
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    barbershop_id: SHOP_ID,
    name: "Diego Santos",
    avatar_url: null,
    specialties: ["Social", "Degradê"],
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    barbershop_id: SHOP_ID,
    name: "Lucas Mendes",
    avatar_url: null,
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
    gallery_urls: [],
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
    gallery_urls: [],
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
    gallery_urls: [],
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
    gallery_urls: [],
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

type DemoState = {
  appointments: Appointment[];
  loyaltyAccounts: LoyaltyAccount[];
};

const globalForDemo = globalThis as typeof globalThis & {
  __cortelyDemo?: DemoState;
};

function state(): DemoState {
  if (!globalForDemo.__cortelyDemo) {
    globalForDemo.__cortelyDemo = {
      appointments: [],
      loyaltyAccounts: [],
    };
  }
  return globalForDemo.__cortelyDemo;
}

function cloneShopBundle(slug: string): ShopBundle | null {
  if (slug !== shop.slug) return null;
  return {
    shop: { ...shop },
    barbers: barbers.filter((b) => b.is_active).map((b) => ({ ...b })),
    services: services.map((s) => ({ ...s })),
    workingHours: workingHours.map((w) => ({ ...w })),
  };
}

export const demoStore = {
  isDemo: true as const,

  getShopBySlug(slug: string) {
    return cloneShopBundle(slug);
  },

  listAppointments(params: {
    barbershopId: string;
    barberId?: string;
    date?: string;
  }) {
    return state()
      .appointments.filter((a) => a.barbershop_id === params.barbershopId)
      .filter((a) => (params.barberId ? a.barber_id === params.barberId : true))
      .filter((a) => (params.date ? a.appointment_date === params.date : true))
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
    const service = services.find((s) => s.id === input.service_id);
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
    state().appointments.push(row);
    return { ...row };
  },

  updateAppointmentStatus(id: string, status: Appointment["status"]) {
    const row = state().appointments.find((a) => a.id === id);
    if (!row) throw new Error("Agendamento não encontrado");
    row.status = status;

    if (status === "completed") {
      demoStore.addLoyaltyPoint({
        barbershopId: row.barbershop_id,
        clientPhone: row.client_phone,
        clientName: row.client_name,
        appointmentId: row.id,
      });
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
    const phone = onlyDigits(input.clientPhone);
    let account = state().loyaltyAccounts.find(
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
      state().loyaltyAccounts.push(account);
    }

    account.points += 1;
    account.total_visits += 1;
    account.client_name = input.clientName;
    account.updated_at = new Date().toISOString();

    if (account.points >= shop.loyalty_threshold) {
      account.points = 0;
    }

    return { ...account };
  },

  dashboard(barbershopId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { appointments, loyaltyAccounts } = state();
    const todayAppointments = appointments.filter(
      (a) =>
        a.barbershop_id === barbershopId &&
        a.appointment_date === today &&
        a.status !== "canceled",
    );
    return {
      todayCount: todayAppointments.length,
      confirmedCount: appointments.filter(
        (a) => a.barbershop_id === barbershopId && a.status === "confirmed",
      ).length,
      completedCount: appointments.filter(
        (a) => a.barbershop_id === barbershopId && a.status === "completed",
      ).length,
      loyaltyClients: loyaltyAccounts.filter(
        (a) => a.barbershop_id === barbershopId,
      ).length,
      appointments: demoStore.listAppointments({ barbershopId }).sort((a, b) =>
        `${b.appointment_date}${b.start_time}`.localeCompare(
          `${a.appointment_date}${a.start_time}`,
        ),
      ),
    };
  },
};
