export type AppointmentStatus = "confirmed" | "completed" | "canceled";

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

export type Appointment = {
  id: string;
  barbershop_id: string;
  barber_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
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

export type ShopBundle = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  workingHours: WorkingHours[];
};
