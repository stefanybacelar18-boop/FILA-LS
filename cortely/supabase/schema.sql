-- Cortely — schema isolado (NÃO compartilhe com FilaDock / FrotaTMS)
-- Execute no SQL Editor de um projeto Supabase NOVO chamado "cortely"

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Barbearias
CREATE TABLE public.barbershops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  logo_url TEXT,
  banner_url TEXT,
  address TEXT,
  primary_color TEXT DEFAULT '#d97706',
  loyalty_threshold INT NOT NULL DEFAULT 5,
  loyalty_reward TEXT NOT NULL DEFAULT '6º corte com 50% de desconto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Perfis admin (ligados ao auth.users do Supabase)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Barbeiros
CREATE TABLE public.barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  specialties TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Serviços
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL DEFAULT 'Geral',
  gallery_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Grade de horários
CREATE TABLE public.working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  CONSTRAINT working_hours_range CHECK (start_time < end_time)
);

-- 6. Agendamentos
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'completed', 'canceled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX appointments_shop_date_idx
  ON public.appointments (barbershop_id, appointment_date);
CREATE INDEX appointments_barber_date_idx
  ON public.appointments (barber_id, appointment_date, start_time);

-- 7. Fidelidade — Barber Points
CREATE TABLE public.loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_phone TEXT NOT NULL,
  client_name TEXT,
  points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  total_visits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbershop_id, client_phone)
);

CREATE TABLE public.loyalty_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id UUID NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.barbershops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY;

-- Leitura pública da vitrine / agenda
CREATE POLICY "Public read barbershops"
  ON public.barbershops FOR SELECT USING (true);

CREATE POLICY "Public read barbers"
  ON public.barbers FOR SELECT USING (is_active = true);

CREATE POLICY "Public read services"
  ON public.services FOR SELECT USING (true);

CREATE POLICY "Public read working_hours"
  ON public.working_hours FOR SELECT USING (true);

CREATE POLICY "Public create appointments"
  ON public.appointments FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read own appointments by phone"
  ON public.appointments FOR SELECT USING (true);

-- Admin: dono da barbearia
CREATE OR REPLACE FUNCTION public.user_barbershop_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT barbershop_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE POLICY "Owner manage barbershop"
  ON public.barbershops FOR ALL
  USING (id = public.user_barbershop_id())
  WITH CHECK (id = public.user_barbershop_id());

CREATE POLICY "Owner manage profile"
  ON public.profiles FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Owner manage barbers"
  ON public.barbers FOR ALL
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

CREATE POLICY "Owner manage services"
  ON public.services FOR ALL
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

CREATE POLICY "Owner manage working_hours"
  ON public.working_hours FOR ALL
  USING (
    barber_id IN (
      SELECT id FROM public.barbers WHERE barbershop_id = public.user_barbershop_id()
    )
  )
  WITH CHECK (
    barber_id IN (
      SELECT id FROM public.barbers WHERE barbershop_id = public.user_barbershop_id()
    )
  );

CREATE POLICY "Owner manage appointments"
  ON public.appointments FOR ALL
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

CREATE POLICY "Owner manage loyalty"
  ON public.loyalty_accounts FOR ALL
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

CREATE POLICY "Owner manage loyalty events"
  ON public.loyalty_events FOR ALL
  USING (
    loyalty_account_id IN (
      SELECT id FROM public.loyalty_accounts
      WHERE barbershop_id = public.user_barbershop_id()
    )
  )
  WITH CHECK (
    loyalty_account_id IN (
      SELECT id FROM public.loyalty_accounts
      WHERE barbershop_id = public.user_barbershop_id()
    )
  );
