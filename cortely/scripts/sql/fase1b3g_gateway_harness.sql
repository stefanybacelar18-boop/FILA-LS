-- Harness 1.B.3-G — schema mínimo pré-migration (appointments + sales + roles)
\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.barbershops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  provisioning_status TEXT NOT NULL DEFAULT 'ready'
);

CREATE OR REPLACE FUNCTION public.user_barbershop_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.barbershop_id FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.barbershop_id IS NOT NULL
    AND p.is_active = TRUE
    AND p.provisioning_status = 'ready'
$$;

ALTER FUNCTION public.user_barbershop_id() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION public.user_barbershop_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_barbershop_id() TO authenticated;

-- appointments mínimo (sem barbers/services para FK simples)
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL DEFAULT 'Cliente',
  client_phone TEXT NOT NULL DEFAULT '000',
  appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME NOT NULL DEFAULT '10:00',
  end_time TIME NOT NULL DEFAULT '10:30',
  status TEXT NOT NULL DEFAULT 'confirmed'
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',
  created_by TEXT NOT NULL DEFAULT 'sys',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
