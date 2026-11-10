-- P0: no-show, CRM clients, schedule blocks, roles, cancel window, reminders delivery

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS cancel_hours_before INT NOT NULL DEFAULT 2;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS barber_id UUID;

DO $$ BEGIN
  ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('owner', 'reception', 'barber'));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason TEXT,
  created_by_role TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_blocks_range CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS schedule_blocks_barber_date_idx
  ON public.schedule_blocks (barber_id, block_date);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  preferred_barber_id UUID REFERENCES public.barbers(id) ON DELETE SET NULL,
  birth_date DATE,
  last_visit_at TIMESTAMPTZ,
  total_visits INT NOT NULL DEFAULT 0,
  no_show_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbershop_id, phone)
);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('confirmed', 'completed', 'canceled', 'no_show'));
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_status_check;
  ALTER TABLE public.reminders
    ADD CONSTRAINT reminders_status_check
    CHECK (status IN ('pending', 'sent', 'skipped', 'failed'));
EXCEPTION WHEN others THEN NULL;
END $$;
