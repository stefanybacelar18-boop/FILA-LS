-- Harness 1.B.2 — schema pré-migration (sales/cash legado + policies via JOIN)
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

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.role FROM public.profiles AS p
  WHERE p.id = auth.uid() AND p.is_active = TRUE AND p.provisioning_status = 'ready'
$$;

ALTER FUNCTION public.user_barbershop_id() OWNER TO CURRENT_USER;
ALTER FUNCTION public.user_role() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION public.user_barbershop_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_barbershop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;

CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  opened_by TEXT NOT NULL,
  closed_by TEXT,
  opening_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_amount NUMERIC(10,2),
  expected_cash NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  cash_session_id UUID,
  client_id UUID,
  client_name TEXT,
  barber_id UUID,
  appointment_id UUID,
  subtotal NUMERIC(10,2) NOT NULL,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tip NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('service', 'product', 'package')),
  ref_id TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL
);

CREATE TABLE public.sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL
);

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sangria', 'suprimento')),
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Policies 1.A: tenant direto + sale_* via JOIN
DO $$
DECLARE t TEXT; pol TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_sessions','sales','cash_movements']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    pol := t || '_tenant_all';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (barbershop_id = public.user_barbershop_id())
         WITH CHECK (barbershop_id = public.user_barbershop_id())',
      pol, t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t
    );
  END LOOP;
END $$;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_items_via_sales ON public.sale_items;
CREATE POLICY sale_items_via_sales ON public.sale_items
  FOR ALL TO authenticated
  USING (
    sale_id IN (
      SELECT s.id FROM public.sales AS s
      WHERE s.barbershop_id = public.user_barbershop_id()
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id FROM public.sales AS s
      WHERE s.barbershop_id = public.user_barbershop_id()
    )
  );

DROP POLICY IF EXISTS sale_payments_via_sales ON public.sale_payments;
CREATE POLICY sale_payments_via_sales ON public.sale_payments
  FOR ALL TO authenticated
  USING (
    sale_id IN (
      SELECT s.id FROM public.sales AS s
      WHERE s.barbershop_id = public.user_barbershop_id()
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id FROM public.sales AS s
      WHERE s.barbershop_id = public.user_barbershop_id()
    )
  );

REVOKE ALL ON TABLE public.sale_items FROM PUBLIC;
REVOKE ALL ON TABLE public.sale_items FROM anon;
REVOKE ALL ON TABLE public.sale_payments FROM PUBLIC;
REVOKE ALL ON TABLE public.sale_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_payments TO authenticated;
