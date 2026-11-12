-- Fase 1.B.5 — Prep pacotes/assinaturas (local/CI only; prod continua json).
-- D3 / D5 / P18 / P25–P27. Sem alterar sellPackageToClient / consume / subscribe JSON.
-- Coluna service_packages.service_ids mantida (compat); remoção no cutover.

-- ═══════════════════════════════════════════════════════════════════════════
-- P12-like: UNIQUE (id, barbershop_id) em clients (+ sales/appointments/services se faltar)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clients'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'appointments'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'services'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- service_packages (endurecer tabela legada se existir; senão criar)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  credits INT NOT NULL CHECK (credits > 0),
  valid_days INT NOT NULL DEFAULT 90 CHECK (valid_days > 0),
  service_ids UUID[] DEFAULT '{}', -- legado; ver service_package_services
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, barbershop_id)
);

DO $$
DECLARE r RECORD;
BEGIN
  -- CASCADE → RESTRICT na FK barbershop
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'service_packages'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%barbershops%'
      AND pg_get_constraintdef(c.oid) ILIKE '%CASCADE%'
  LOOP
    EXECUTE format('ALTER TABLE public.service_packages DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_barbershop_id_fkey'
  ) THEN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_barbershop_id_fkey
      FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;

  -- CHECKs / tipagem (idempotente)
  ALTER TABLE public.service_packages
    ALTER COLUMN price TYPE NUMERIC(12,2);
  BEGIN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_price_ck CHECK (price >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_credits_ck CHECK (credits > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_valid_days_ck CHECK (valid_days > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS public.service_package_services (
  package_id UUID NOT NULL,
  service_id UUID NOT NULL,
  barbershop_id UUID NOT NULL,
  PRIMARY KEY (package_id, service_id),
  FOREIGN KEY (package_id, barbershop_id)
    REFERENCES public.service_packages (id, barbershop_id) ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_package_services_service_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'services_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_05: pré-condição services_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.service_package_services
      ADD CONSTRAINT service_package_services_service_tenant_fkey
      FOREIGN KEY (service_id, barbershop_id)
      REFERENCES public.services (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- client_packages
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  package_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  credits_total INT NOT NULL CHECK (credits_total > 0),
  credits_used INT NOT NULL DEFAULT 0
    CHECK (credits_used >= 0 AND credits_used <= credits_total),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('active', 'depleted', 'expired', 'canceled')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, barbershop_id),
  UNIQUE (barbershop_id, sale_id, package_id),
  CHECK ((status = 'depleted') = (credits_used = credits_total))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_packages_client_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'clients_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_05: pré-condição clients_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.client_packages
      ADD CONSTRAINT client_packages_client_tenant_fkey
      FOREIGN KEY (client_id, barbershop_id)
      REFERENCES public.clients (id, barbershop_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_packages_package_tenant_fkey'
  ) THEN
    ALTER TABLE public.client_packages
      ADD CONSTRAINT client_packages_package_tenant_fkey
      FOREIGN KEY (package_id, barbershop_id)
      REFERENCES public.service_packages (id, barbershop_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_packages_sale_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_05: pré-condição sales_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.client_packages
      ADD CONSTRAINT client_packages_sale_tenant_fkey
      FOREIGN KEY (sale_id, barbershop_id)
      REFERENCES public.sales (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- client_package_consumptions (append-only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_package_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL,
  client_package_id UUID NOT NULL,
  appointment_id UUID NULL,
  consumed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversal_of UUID NULL,
  UNIQUE (id, barbershop_id),
  FOREIGN KEY (client_package_id, barbershop_id)
    REFERENCES public.client_packages (id, barbershop_id) ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_package_consumptions_appt_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'appointments_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_05: pré-condição appointments_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.client_package_consumptions
      ADD CONSTRAINT client_package_consumptions_appt_tenant_fkey
      FOREIGN KEY (appointment_id, barbershop_id)
      REFERENCES public.appointments (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.client_package_consumptions
  DROP CONSTRAINT IF EXISTS client_package_consumptions_reversal_fkey;
ALTER TABLE public.client_package_consumptions
  ADD CONSTRAINT client_package_consumptions_reversal_fkey
  FOREIGN KEY (reversal_of, barbershop_id)
  REFERENCES public.client_package_consumptions (id, barbershop_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS client_package_consumptions_appt_uidx
  ON public.client_package_consumptions (client_package_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND reversal_of IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_package_consumptions_reversal_uidx
  ON public.client_package_consumptions (reversal_of)
  WHERE reversal_of IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- subscription_plans / client_subscriptions (sem cobrança — P27)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  price_monthly NUMERIC(12,2) NOT NULL CHECK (price_monthly >= 0),
  credits_per_month INT NOT NULL CHECK (credits_per_month >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, barbershop_id)
);

CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_billing_at TIMESTAMPTZ NOT NULL,
  UNIQUE (id, barbershop_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_subscriptions_client_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'clients_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_05: pré-condição clients_id_barbershop_uidx ausente (subs)';
    END IF;
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_client_tenant_fkey
      FOREIGN KEY (client_id, barbershop_id)
      REFERENCES public.clients (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_subscriptions_plan_tenant_fkey'
  ) THEN
    ALTER TABLE public.client_subscriptions
      ADD CONSTRAINT client_subscriptions_plan_tenant_fkey
      FOREIGN KEY (plan_id, barbershop_id)
      REFERENCES public.subscription_plans (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS + grants (P18)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_packages', 'service_package_services', 'client_packages',
    'client_package_consumptions', 'subscription_plans', 'client_subscriptions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (barbershop_id = public.user_barbershop_id())',
      t || '_tenant_select', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.client_package_consumptions_append_only()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'client_package_consumptions append-only';
END;
$$;
DROP TRIGGER IF EXISTS client_package_consumptions_append_only_trg
  ON public.client_package_consumptions;
CREATE TRIGGER client_package_consumptions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.client_package_consumptions
  FOR EACH ROW EXECUTE PROCEDURE public.client_package_consumptions_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_sell_package(
  p_barbershop_id UUID,
  p_client_id UUID,
  p_package_id UUID,
  p_sale_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  client_package_id UUID,
  credits_total INT,
  expires_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_pkg public.service_packages%ROWTYPE;
  v_existing public.client_packages%ROWTYPE;
  v_id UUID;
  v_exp TIMESTAMPTZ;
  v_qty INT;
BEGIN
  -- Idempotente por (shop, sale, package)
  SELECT * INTO v_existing
  FROM public.client_packages cp
  WHERE cp.barbershop_id = p_barbershop_id
    AND cp.sale_id = p_sale_id
    AND cp.package_id = p_package_id;
  IF FOUND THEN
    client_package_id := v_existing.id;
    credits_total := v_existing.credits_total;
    expires_at := v_existing.expires_at;
    status := v_existing.status;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id AND s.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_sale.status <> 'paid' THEN
    RAISE EXCEPTION 'SALE_NOT_PAID' USING ERRCODE = 'PT409';
  END IF;
  IF v_sale.client_id IS NOT NULL AND v_sale.client_id <> p_client_id THEN
    RAISE EXCEPTION 'SALE_CLIENT_MISMATCH' USING ERRCODE = 'PT409';
  END IF;

  SELECT si.quantity INTO v_qty
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id
    AND si.barbershop_id = p_barbershop_id
    AND si.kind = 'package'
    AND si.ref_id = p_package_id::text
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_MISSING_PACKAGE_ITEM' USING ERRCODE = 'PT409';
  END IF;
  IF v_qty <> 1 THEN
    RAISE EXCEPTION 'PACKAGE_QUANTITY_UNSUPPORTED' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO v_pkg
  FROM public.service_packages sp
  WHERE sp.id = p_package_id AND sp.barbershop_id = p_barbershop_id AND sp.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- Cliente do tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.barbershop_id = p_barbershop_id
  ) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- Rechecagem pós-lock (corrida com outra sell da mesma sale)
  SELECT * INTO v_existing
  FROM public.client_packages cp
  WHERE cp.barbershop_id = p_barbershop_id
    AND cp.sale_id = p_sale_id
    AND cp.package_id = p_package_id;
  IF FOUND THEN
    client_package_id := v_existing.id;
    credits_total := v_existing.credits_total;
    expires_at := v_existing.expires_at;
    status := v_existing.status;
    RETURN NEXT;
    RETURN;
  END IF;

  v_exp := now() + make_interval(days => v_pkg.valid_days);

  BEGIN
    INSERT INTO public.client_packages (
      barbershop_id, client_id, package_id, sale_id,
      credits_total, credits_used, expires_at, status
    ) VALUES (
      p_barbershop_id, p_client_id, p_package_id, p_sale_id,
      v_pkg.credits, 0, v_exp, 'active'
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO v_existing
      FROM public.client_packages cp
      WHERE cp.barbershop_id = p_barbershop_id
        AND cp.sale_id = p_sale_id
        AND cp.package_id = p_package_id;
      IF NOT FOUND THEN RAISE; END IF;
      client_package_id := v_existing.id;
      credits_total := v_existing.credits_total;
      expires_at := v_existing.expires_at;
      status := v_existing.status;
      RETURN NEXT;
      RETURN;
  END;

  client_package_id := v_id;
  credits_total := v_pkg.credits;
  expires_at := v_exp;
  status := 'active';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_consume_package_credit(
  p_barbershop_id UUID,
  p_client_package_id UUID,
  p_appointment_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  consumption_id UUID,
  credits_left INT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cp public.client_packages%ROWTYPE;
  v_existing UUID;
  v_id UUID;
  v_left INT;
BEGIN
  SELECT * INTO v_cp
  FROM public.client_packages cp
  WHERE cp.id = p_client_package_id AND cp.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENT_PACKAGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- Idempotente: mesmo agendamento já consumido (não revertido)
  IF p_appointment_id IS NOT NULL THEN
    SELECT c.id INTO v_existing
    FROM public.client_package_consumptions c
    WHERE c.barbershop_id = p_barbershop_id
      AND c.client_package_id = p_client_package_id
      AND c.appointment_id = p_appointment_id
      AND c.reversal_of IS NULL
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      consumption_id := v_existing;
      credits_left := v_cp.credits_total - v_cp.credits_used;
      status := v_cp.status;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF v_cp.status = 'canceled' THEN
    RAISE EXCEPTION 'PACKAGE_CANCELED' USING ERRCODE = 'PT409';
  END IF;

  -- Expirado: marcar e RETORNAR (sem RAISE — RAISE desfaz o UPDATE na mesma TX).
  -- Adapter/SQL tratam consumption_id NULL + status=expired como 409.
  IF v_cp.status = 'expired' OR v_cp.expires_at < now() THEN
    IF v_cp.status <> 'expired' AND v_cp.credits_used < v_cp.credits_total THEN
      UPDATE public.client_packages AS cp
      SET status = 'expired'
      WHERE cp.id = v_cp.id AND cp.barbershop_id = p_barbershop_id
        AND cp.credits_used < cp.credits_total;
    END IF;
    consumption_id := NULL;
    credits_left := v_cp.credits_total - v_cp.credits_used;
    status := 'expired';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_cp.status <> 'active' OR v_cp.credits_used >= v_cp.credits_total THEN
    RAISE EXCEPTION 'PACKAGE_NO_CREDITS' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.client_package_consumptions (
    barbershop_id, client_package_id, appointment_id, consumed_by
  ) VALUES (
    p_barbershop_id, p_client_package_id, p_appointment_id, p_actor
  )
  RETURNING id INTO v_id;

  v_left := v_cp.credits_total - (v_cp.credits_used + 1);
  UPDATE public.client_packages AS cp
  SET
    credits_used = cp.credits_used + 1,
    status = CASE
      WHEN cp.credits_used + 1 >= cp.credits_total THEN 'depleted'
      ELSE 'active'
    END
  WHERE cp.id = v_cp.id AND cp.barbershop_id = p_barbershop_id;

  consumption_id := v_id;
  credits_left := v_left;
  status := CASE WHEN v_left = 0 THEN 'depleted' ELSE 'active' END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_revert_package_consumption(
  p_barbershop_id UUID,
  p_consumption_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  reversal_id UUID,
  credits_left INT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_c public.client_package_consumptions%ROWTYPE;
  v_cp public.client_packages%ROWTYPE;
  v_existing UUID;
  v_id UUID;
  v_left INT;
BEGIN
  SELECT * INTO v_c
  FROM public.client_package_consumptions c
  WHERE c.id = p_consumption_id AND c.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSUMPTION_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_c.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_REVERT_A_REVERSAL' USING ERRCODE = 'PT409';
  END IF;

  SELECT r.id INTO v_existing
  FROM public.client_package_consumptions r
  WHERE r.barbershop_id = p_barbershop_id
    AND r.reversal_of = v_c.id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_cp FROM public.client_packages
    WHERE id = v_c.client_package_id AND barbershop_id = p_barbershop_id;
    reversal_id := v_existing;
    credits_left := v_cp.credits_total - v_cp.credits_used;
    status := v_cp.status;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_cp
  FROM public.client_packages cp
  WHERE cp.id = v_c.client_package_id AND cp.barbershop_id = p_barbershop_id
  FOR UPDATE;

  INSERT INTO public.client_package_consumptions (
    barbershop_id, client_package_id, appointment_id, consumed_by, reversal_of
  ) VALUES (
    p_barbershop_id, v_c.client_package_id, v_c.appointment_id, p_actor, v_c.id
  )
  RETURNING id INTO v_id;

  UPDATE public.client_packages cp
  SET
    credits_used = cp.credits_used - 1,
    status = CASE
      WHEN cp.status = 'canceled' THEN 'canceled'
      WHEN cp.expires_at < now() THEN 'expired'
      ELSE 'active'
    END
  WHERE cp.id = v_cp.id AND cp.barbershop_id = p_barbershop_id
    AND cp.credits_used > 0;

  SELECT cp.credits_total - cp.credits_used, cp.status
  INTO v_left, status
  FROM public.client_packages cp
  WHERE cp.id = v_cp.id AND cp.barbershop_id = p_barbershop_id;

  reversal_id := v_id;
  credits_left := v_left;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_cancel_client_package(
  p_barbershop_id UUID,
  p_client_package_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  client_package_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cp public.client_packages%ROWTYPE;
  v_active INT;
BEGIN
  SELECT * INTO v_cp
  FROM public.client_packages cp
  WHERE cp.id = p_client_package_id AND cp.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLIENT_PACKAGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_cp.status = 'canceled' THEN
    client_package_id := v_cp.id;
    status := 'canceled';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_active
  FROM public.client_package_consumptions c
  WHERE c.barbershop_id = p_barbershop_id
    AND c.client_package_id = p_client_package_id
    AND c.reversal_of IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.client_package_consumptions r
      WHERE r.barbershop_id = p_barbershop_id AND r.reversal_of = c.id
    );
  IF v_active > 0 THEN
    RAISE EXCEPTION 'PACKAGE_HAS_ACTIVE_CONSUMPTIONS' USING ERRCODE = 'PT409';
  END IF;

  IF v_cp.credits_used = v_cp.credits_total THEN
    RAISE EXCEPTION 'PACKAGE_ALREADY_DEPLETED' USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.client_packages AS cp
  SET status = 'canceled'
  WHERE cp.id = v_cp.id AND cp.barbershop_id = p_barbershop_id
    AND cp.credits_used < cp.credits_total;

  client_package_id := v_cp.id;
  status := 'canceled';
  RETURN NEXT;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ops_sell_package(uuid,uuid,uuid,uuid,text)',
    'ops_consume_package_credit(uuid,uuid,uuid,text)',
    'ops_revert_package_consumption(uuid,uuid,text)',
    'ops_cancel_client_package(uuid,uuid,text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.service_packages.service_ids IS
  'Legado JSON/array; fonte canônica prep = service_package_services. Remover no cutover.';
