-- Fase 1.A — RLS nas tabelas operacionais existentes + grants
-- Ops continua em JSON no app nesta etapa; RLS prepara o Postgres.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'suppliers',
    'cash_sessions',
    'sales',
    'service_packages',
    'waitlist',
    'payables',
    'campaigns',
    'reviews',
    'cash_movements',
    'stock_movements',
    'inventory_counts',
    'receivables',
    'ops_audit_log',
    'fiscal_documents',
    'sale_items',
    'sale_payments'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- ENABLE + FORCE são obrigatórios. Falha = migration falha (sem swallow).
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Verificação explícita: toda tabela ops presente deve ter RLS + FORCE
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'suppliers', 'cash_sessions', 'sales', 'service_packages',
    'waitlist', 'payables', 'campaigns', 'reviews', 'cash_movements',
    'stock_movements', 'inventory_counts', 'receivables', 'ops_audit_log',
    'fiscal_documents', 'sale_items', 'sale_payments'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
        INTO r
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t;
      IF NOT r.rls OR NOT r.force_rls THEN
        RAISE EXCEPTION
          'Falha de segurança: public.% deve ter ENABLE+FORCE RLS (rls=%, force=%)',
          t, r.rls, r.force_rls;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Policies tenant (barbershop_id direto)
DO $$
DECLARE
  t TEXT;
  pol TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'suppliers',
    'cash_sessions',
    'sales',
    'service_packages',
    'waitlist',
    'payables',
    'campaigns',
    'reviews',
    'cash_movements',
    'stock_movements',
    'inventory_counts',
    'receivables',
    'ops_audit_log',
    'fiscal_documents'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      pol := t || '_tenant_all';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (barbershop_id = public.user_barbershop_id())
           WITH CHECK (barbershop_id = public.user_barbershop_id())',
        pol, t
      );
      -- Append-only audit: sem UPDATE/DELETE para authenticated
      IF t = 'ops_audit_log' THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I
             FOR SELECT TO authenticated
             USING (barbershop_id = public.user_barbershop_id())',
          t || '_tenant_select', t
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I
             FOR INSERT TO authenticated
             WITH CHECK (barbershop_id = public.user_barbershop_id())',
          t || '_tenant_insert', t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- sale_items / sale_payments via JOIN em sales (ainda sem barbershop_id denormalizado na 1.A)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sale_items'
  ) THEN
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
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sale_payments'
  ) THEN
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
  END IF;
END $$;

-- Grants: authenticated usa RLS; anon sem DML em ops
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'suppliers', 'cash_sessions', 'sales', 'sale_items',
    'sale_payments', 'service_packages', 'waitlist', 'payables',
    'campaigns', 'reviews', 'cash_movements', 'stock_movements',
    'inventory_counts', 'receivables', 'ops_audit_log', 'fiscal_documents'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Profiles: SELECT próprio sem chamar user_barbershop_id (anti-recursão)
DROP POLICY IF EXISTS "Read own profile" ON public.profiles;
CREATE POLICY "Read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Update own profile safe" ON public.profiles;
CREATE POLICY "Update own profile safe"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.user_role()
    AND barbershop_id IS NOT DISTINCT FROM public.user_barbershop_id()
    AND is_active = TRUE
  );
