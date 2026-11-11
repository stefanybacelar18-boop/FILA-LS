-- =============================================================================
-- Cortely Etapa 1.A — harness + testes reais de isolamento SQL (dois tenants)
-- Executado por scripts/security-fase1a-rls-sql.ts contra PostgreSQL local/CI.
-- NÃO é migration remota; ambiente efêmero de teste.
-- =============================================================================

\set ON_ERROR_STOP on

-- Roles estilo Supabase
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- auth.uid() mock (JWT claim sub) — USAGE em auth como no Supabase
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schema mínimo das tabelas ops 1.A
-- ---------------------------------------------------------------------------
CREATE TABLE public.barbershops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'barber',
  barber_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  provisioning_status TEXT NOT NULL DEFAULT 'ready',
  session_generation INT NOT NULL DEFAULT 1,
  CONSTRAINT profiles_provisioning_status_check CHECK (
    provisioning_status IN ('pending_email', 'provisioning', 'ready', 'failed')
  )
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE
);
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
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
CREATE TABLE public.service_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE public.payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  rating INT NOT NULL DEFAULT 5
);
CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL
);
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0
);
CREATE TABLE public.inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  counted INT NOT NULL DEFAULT 0
);
CREATE TABLE public.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE public.ops_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  action TEXT NOT NULL
);
CREATE TABLE public.fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  number TEXT NOT NULL
);

-- Helpers 1.A (espelho de 20261111_02)
CREATE OR REPLACE FUNCTION public.user_barbershop_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.barbershop_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.barbershop_id IS NOT NULL
    AND p.is_active = TRUE
    AND p.provisioning_status = 'ready'
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active = TRUE
    AND p.provisioning_status = 'ready'
$$;

ALTER FUNCTION public.user_barbershop_id() OWNER TO CURRENT_USER;
ALTER FUNCTION public.user_role() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION public.user_barbershop_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_barbershop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;

-- provision stub (só service_role) — confirma grant mínimo
CREATE OR REPLACE FUNCTION public.provision_owner_barbershop(
  p_user_id UUID, p_full_name TEXT, p_email TEXT,
  p_shop_name TEXT, p_shop_slug TEXT, p_shop_phone TEXT
) RETURNS TABLE (barbershop_id UUID, profile_id UUID, status TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT NULL::uuid, NULL::uuid, 'stub'::text WHERE false; $$;
REVOKE ALL ON FUNCTION public.provision_owner_barbershop(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_owner_barbershop(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.provision_owner_barbershop(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_owner_barbershop(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
