export type AppointmentStatus =
  | "confirmed"
  | "completed"
  | "canceled"
  | "no_show";

export type ReminderStatus = "pending" | "sent" | "skipped" | "failed";
export type StaffRole = "owner" | "reception" | "barber";
export type WhatsAppDeliveryMode = "manual" | "api";

export type Barbershop = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  logo_url: string | null;
  banner_url: string | null;
  address: string | null;
  primary_color: string;
  loyalty_threshold: number;
  loyalty_reward: string;
  reminder_hours_before: number;
  cancel_hours_before: number;
  /** Agendamento online (estilo Salon Soft) */
  booking_link_enabled: boolean;
  booking_slot_minutes: number;
  booking_show_prices: boolean;
  booking_group_by_category: boolean;
  /** IDs de barbeiros no link público; vazio = todos ativos */
  booking_barber_ids: string[];
  /** Feriados (YYYY-MM-DD) — bloqueiam agenda online */
  holidays: string[];
  created_at: string;
};

export type Barber = {
  id: string;
  barbershop_id: string;
  name: string;
  avatar_url: string | null;
  specialties: string[];
  is_active: boolean;
  created_at: string;
};

export type Service = {
  id: string;
  barbershop_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
  gallery_urls: string[];
  created_at: string;
};

export type WorkingHours = {
  id: string;
  barber_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
};

export type ScheduleBlock = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by_role: StaffRole | "system";
  created_at: string;
};

export type Appointment = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  service_id: string;
  client_id: string | null;
  client_name: string;
  client_phone: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  barbershop_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  preferred_barber_id: string | null;
  birth_date: string | null;
  last_visit_at: string | null;
  total_visits: number;
  no_show_count: number;
  created_at: string;
  updated_at: string;
};

export type LoyaltyAccount = {
  id: string;
  barbershop_id: string;
  client_phone: string;
  client_name: string | null;
  points: number;
  total_visits: number;
  updated_at: string;
};

export type Reminder = {
  id: string;
  barbershop_id: string;
  appointment_id: string;
  client_name: string;
  client_phone: string;
  scheduled_for: string;
  status: ReminderStatus;
  message: string;
  channel: "whatsapp";
  delivery_mode: WhatsAppDeliveryMode;
  created_at: string;
};

export type StaffUser = {
  id: string;
  barbershop_id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  barber_id: string | null;
};

export type ShopBundle = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  workingHours: WorkingHours[];
};

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  barbershop_id: string;
  barber_id: string | null;
};
