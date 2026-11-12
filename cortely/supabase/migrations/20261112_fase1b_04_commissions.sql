-- Fase 1.B.4 — Prep comissões / vales / metas (local/CI only; prod continua json).
-- D6 / P3 / P12 / P15 / P18 / P24. Sem alterar createSale/refund JSON.

-- ═══════════════════════════════════════════════════════════════════════════
-- P12: UNIQUE (id, barbershop_id) em barbers, services, sale_items
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'barbers'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.barbers
      ADD CONSTRAINT barbers_id_barbershop_uidx UNIQUE (id, barbershop_id);
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
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sale_items'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_id_barbershop_uidx UNIQUE (id, barbershop_id);
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
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- commission_rules
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  barber_id UUID NULL,
  service_id UUID NULL,
  service_percent NUMERIC(5,2) NOT NULL
    CHECK (service_percent >= 0 AND service_percent <= 100),
  product_percent NUMERIC(5,2) NOT NULL
    CHECK (product_percent >= 0 AND product_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_rules_barber_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição barbers_id_barbershop_uidx ausente (FK rules)';
    END IF;
    ALTER TABLE public.commission_rules
      ADD CONSTRAINT commission_rules_barber_tenant_fkey
      FOREIGN KEY (barber_id, barbershop_id)
      REFERENCES public.barbers (id, barbershop_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_rules_service_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'services_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição services_id_barbershop_uidx ausente (FK rules)';
    END IF;
    ALTER TABLE public.commission_rules
      ADD CONSTRAINT commission_rules_service_tenant_fkey
      FOREIGN KEY (service_id, barbershop_id)
      REFERENCES public.services (id, barbershop_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- commission_payouts (antes de entries — FK payout_batch_id)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL,
  gross NUMERIC(12,2) NOT NULL CHECK (gross >= 0),
  advances_deducted NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (advances_deducted >= 0),
  net NUMERIC(12,2) NOT NULL CHECK (net >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, barbershop_id),
  CHECK (net = round((gross - advances_deducted)::numeric, 2))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_payouts_barber_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição barbers_id_barbershop_uidx ausente (FK payouts)';
    END IF;
    ALTER TABLE public.commission_payouts
      ADD CONSTRAINT commission_payouts_barber_tenant_fkey
      FOREIGN KEY (barber_id, barbershop_id)
      REFERENCES public.barbers (id, barbershop_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- commission_entries (+ reversal_of P15)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  sale_item_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('service', 'product')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  basis NUMERIC(12,2) NOT NULL CHECK (basis > 0),
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'paid', 'reversed', 'clawback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  clawback_of UUID NULL,
  reversal_of UUID NULL,
  payout_batch_id UUID NULL,
  UNIQUE (id, barbershop_id),
  CHECK (status <> 'clawback' OR clawback_of IS NOT NULL),
  CHECK (status <> 'reversed' OR reversal_of IS NOT NULL),
  CHECK (status <> 'paid' OR paid_at IS NOT NULL),
  CHECK (status = 'paid' OR payout_batch_id IS NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_entries_sale_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição sales_id_barbershop_uidx ausente (FK entries)';
    END IF;
    ALTER TABLE public.commission_entries
      ADD CONSTRAINT commission_entries_sale_tenant_fkey
      FOREIGN KEY (sale_id, barbershop_id)
      REFERENCES public.sales (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_entries_item_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição sale_items_id_barbershop_uidx ausente (FK entries)';
    END IF;
    ALTER TABLE public.commission_entries
      ADD CONSTRAINT commission_entries_item_tenant_fkey
      FOREIGN KEY (sale_item_id, barbershop_id)
      REFERENCES public.sale_items (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_entries_barber_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição barbers_id_barbershop_uidx ausente (FK entries)';
    END IF;
    ALTER TABLE public.commission_entries
      ADD CONSTRAINT commission_entries_barber_tenant_fkey
      FOREIGN KEY (barber_id, barbershop_id)
      REFERENCES public.barbers (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.commission_entries
  DROP CONSTRAINT IF EXISTS commission_entries_clawback_tenant_fkey;
ALTER TABLE public.commission_entries
  ADD CONSTRAINT commission_entries_clawback_tenant_fkey
  FOREIGN KEY (clawback_of, barbershop_id)
  REFERENCES public.commission_entries (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.commission_entries
  DROP CONSTRAINT IF EXISTS commission_entries_reversal_tenant_fkey;
ALTER TABLE public.commission_entries
  ADD CONSTRAINT commission_entries_reversal_tenant_fkey
  FOREIGN KEY (reversal_of, barbershop_id)
  REFERENCES public.commission_entries (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.commission_entries
  DROP CONSTRAINT IF EXISTS commission_entries_payout_tenant_fkey;
ALTER TABLE public.commission_entries
  ADD CONSTRAINT commission_entries_payout_tenant_fkey
  FOREIGN KEY (payout_batch_id, barbershop_id)
  REFERENCES public.commission_payouts (id, barbershop_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_active_item_uidx
  ON public.commission_entries (barbershop_id, sale_item_id, barber_id)
  WHERE status IN ('pending', 'paid');

CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_clawback_uidx
  ON public.commission_entries (clawback_of)
  WHERE status = 'clawback';

CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_reversal_uidx
  ON public.commission_entries (reversal_of)
  WHERE status = 'reversed';

-- ═══════════════════════════════════════════════════════════════════════════
-- staff_advances + deductions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  deducted_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (deducted_amount >= 0 AND deducted_amount <= amount),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_deducted', 'deducted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deducted_at TIMESTAMPTZ NULL,
  UNIQUE (id, barbershop_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_advances_barber_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição barbers_id_barbershop_uidx ausente (FK advances)';
    END IF;
    ALTER TABLE public.staff_advances
      ADD CONSTRAINT staff_advances_barber_tenant_fkey
      FOREIGN KEY (barber_id, barbershop_id)
      REFERENCES public.barbers (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.staff_advance_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL,
  advance_id UUID NOT NULL,
  payout_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (advance_id, barbershop_id)
    REFERENCES public.staff_advances (id, barbershop_id) ON DELETE RESTRICT,
  FOREIGN KEY (payout_id, barbershop_id)
    REFERENCES public.commission_payouts (id, barbershop_id) ON DELETE RESTRICT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- barber_goals
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.barber_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL,
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  revenue_target NUMERIC(12,2) NOT NULL CHECK (revenue_target >= 0),
  services_target INT NOT NULL CHECK (services_target >= 0),
  UNIQUE (barbershop_id, barber_id, month)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'barber_goals_barber_tenant_fkey'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx'
    ) THEN
      RAISE EXCEPTION 'fase1b_04: pré-condição barbers_id_barbershop_uidx ausente (FK goals)';
    END IF;
    ALTER TABLE public.barber_goals
      ADD CONSTRAINT barber_goals_barber_tenant_fkey
      FOREIGN KEY (barber_id, barbershop_id)
      REFERENCES public.barbers (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS + grants (P18: escrita só service_role; authenticated SELECT)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commission_rules','commission_entries','commission_payouts',
    'staff_advances','staff_advance_deductions','barber_goals'
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

-- Append-only: entries — sem UPDATE/DELETE para authenticated (já só SELECT).
-- Trigger bloqueia UPDATE destrutivo exceto pending→paid via função (service_role bypass RLS).

CREATE OR REPLACE FUNCTION public.commission_entries_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commission_entries append-only: DELETE proibido';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- única transição permitida: pending → paid (+ paid_at, payout_batch_id)
    IF OLD.status = 'pending' AND NEW.status = 'paid'
       AND NEW.amount = OLD.amount AND NEW.basis = OLD.basis
       AND NEW.percent = OLD.percent
       AND NEW.sale_id = OLD.sale_id AND NEW.sale_item_id = OLD.sale_item_id
       AND NEW.barber_id = OLD.barber_id AND NEW.barbershop_id = OLD.barbershop_id
       AND NEW.kind = OLD.kind
       AND NEW.paid_at IS NOT NULL AND NEW.payout_batch_id IS NOT NULL
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'commission_entries append-only: UPDATE proibido (só pending→paid via payout)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commission_entries_append_only_trg ON public.commission_entries;
CREATE TRIGGER commission_entries_append_only_trg
  BEFORE UPDATE OR DELETE ON public.commission_entries
  FOR EACH ROW EXECUTE PROCEDURE public.commission_entries_append_only();

CREATE OR REPLACE FUNCTION public.commission_payouts_append_only()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'commission_payouts append-only';
END;
$$;
DROP TRIGGER IF EXISTS commission_payouts_append_only_trg ON public.commission_payouts;
CREATE TRIGGER commission_payouts_append_only_trg
  BEFORE UPDATE OR DELETE ON public.commission_payouts
  FOR EACH ROW EXECUTE PROCEDURE public.commission_payouts_append_only();

CREATE OR REPLACE FUNCTION public.staff_advance_deductions_append_only()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'staff_advance_deductions append-only';
END;
$$;
DROP TRIGGER IF EXISTS staff_advance_deductions_append_only_trg ON public.staff_advance_deductions;
CREATE TRIGGER staff_advance_deductions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.staff_advance_deductions
  FOR EACH ROW EXECUTE PROCEDURE public.staff_advance_deductions_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções atômicas
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_accrue_commission(
  p_barbershop_id UUID,
  p_sale_id UUID
)
RETURNS TABLE (
  entry_id UUID,
  sale_item_id UUID,
  amount NUMERIC,
  basis NUMERIC,
  percent NUMERIC,
  kind TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item RECORD;
  v_rule public.commission_rules%ROWTYPE;
  v_barber UUID;
  v_pct NUMERIC;
  v_kind TEXT;
  v_basis NUMERIC;
  v_amount NUMERIC;
  v_id UUID;
BEGIN
  SELECT * INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id AND s.barbershop_id = p_barbershop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  v_barber := v_sale.barber_id;
  IF v_barber IS NULL THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT si.*
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.barbershop_id = p_barbershop_id
      AND si.kind IN ('service', 'product')
  LOOP
    -- Idempotente: já existe pending/paid para o item
    IF EXISTS (
      SELECT 1 FROM public.commission_entries ce
      WHERE ce.barbershop_id = p_barbershop_id
        AND ce.sale_item_id = v_item.id
        AND ce.barber_id = v_barber
        AND ce.status IN ('pending', 'paid')
    ) THEN
      CONTINUE;
    END IF;

    -- Regra: barbeiro específico, senão padrão (barber_id NULL) — espelha JSON
    SELECT * INTO v_rule
    FROM public.commission_rules r
    WHERE r.barbershop_id = p_barbershop_id
      AND (r.barber_id = v_barber OR r.barber_id IS NULL)
    ORDER BY CASE WHEN r.barber_id IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_kind := CASE WHEN v_item.kind = 'product' THEN 'product' ELSE 'service' END;
    v_pct := CASE WHEN v_kind = 'product' THEN v_rule.product_percent ELSE v_rule.service_percent END;
    v_basis := round((v_item.unit_price * v_item.quantity)::numeric, 2);
    IF v_basis <= 0 OR v_pct <= 0 THEN
      CONTINUE;
    END IF;
    v_amount := round((v_basis * v_pct / 100)::numeric, 2);
    IF v_amount <= 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.commission_entries (
        barbershop_id, barber_id, sale_id, sale_item_id, kind,
        amount, basis, percent, status
      ) VALUES (
        p_barbershop_id, v_barber, p_sale_id, v_item.id, v_kind,
        v_amount, v_basis, v_pct, 'pending'
      )
      RETURNING id INTO v_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Corrida: outra TX já inseriu pending/paid para o item — no-op
        CONTINUE;
    END;

    entry_id := v_id;
    sale_item_id := v_item.id;
    amount := v_amount;
    basis := v_basis;
    percent := v_pct;
    kind := v_kind;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_reverse_pending_commissions(
  p_barbershop_id UUID,
  p_sale_id UUID
)
RETURNS TABLE (
  reversal_id UUID,
  original_id UUID,
  amount NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_e RECORD;
  v_id UUID;
BEGIN
  FOR v_e IN
    SELECT ce.*
    FROM public.commission_entries ce
    WHERE ce.barbershop_id = p_barbershop_id
      AND ce.sale_id = p_sale_id
      AND ce.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_entries r
        WHERE r.barbershop_id = p_barbershop_id
          AND r.status = 'reversed'
          AND r.reversal_of = ce.id
      )
    FOR UPDATE OF ce
  LOOP
    INSERT INTO public.commission_entries (
      barbershop_id, barber_id, sale_id, sale_item_id, kind,
      amount, basis, percent, status, reversed_at, reversal_of
    ) VALUES (
      v_e.barbershop_id, v_e.barber_id, v_e.sale_id, v_e.sale_item_id, v_e.kind,
      v_e.amount, v_e.basis, v_e.percent, 'reversed', now(), v_e.id
    )
    RETURNING id INTO v_id;

    reversal_id := v_id;
    original_id := v_e.id;
    amount := v_e.amount;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_clawback_commission(
  p_barbershop_id UUID,
  p_entry_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  clawback_id UUID,
  original_id UUID,
  amount NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_e public.commission_entries%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_e
  FROM public.commission_entries ce
  WHERE ce.id = p_entry_id AND ce.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_e.status <> 'paid' THEN
    RAISE EXCEPTION 'CLAWBACK_REQUIRES_PAID' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commission_entries c
    WHERE c.barbershop_id = p_barbershop_id
      AND c.status = 'clawback' AND c.clawback_of = v_e.id
  ) THEN
    RAISE EXCEPTION 'CLAWBACK_ALREADY_EXISTS' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.commission_entries (
    barbershop_id, barber_id, sale_id, sale_item_id, kind,
    amount, basis, percent, status, clawback_of
  ) VALUES (
    v_e.barbershop_id, v_e.barber_id, v_e.sale_id, v_e.sale_item_id, v_e.kind,
    v_e.amount, v_e.basis, v_e.percent, 'clawback', v_e.id
  )
  RETURNING id INTO v_id;

  clawback_id := v_id;
  original_id := v_e.id;
  amount := v_e.amount;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_pay_commissions(
  p_barbershop_id UUID,
  p_barber_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  payout_id UUID,
  count INT,
  gross NUMERIC,
  advances_deducted NUMERIC,
  net NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC := 0;
  v_deduct NUMERIC := 0;
  v_remaining NUMERIC;
  v_payout UUID;
  v_adv RECORD;
  v_entry RECORD;
  v_take NUMERIC;
  v_n INT := 0;
  v_locked UUID[] := '{}';
  v_ids UUID[] := '{}';
  v_adv_ids UUID[] := '{}';
  v_adv_amts NUMERIC[] := '{}';
  i INT;
BEGIN
  -- 1) Trava candidates pending. Reverse só INSERE (origem não muda), então
  --    FOR UPDATE NÃO reavalia NOT EXISTS após wait — ver passo 2.
  FOR v_entry IN
    SELECT ce.id
    FROM public.commission_entries ce
    WHERE ce.barbershop_id = p_barbershop_id
      AND ce.barber_id = p_barber_id
      AND ce.status = 'pending'
    ORDER BY ce.created_at ASC
    FOR UPDATE OF ce
  LOOP
    v_locked := array_append(v_locked, v_entry.id);
  END LOOP;

  -- 2) Novo statement (novo snapshot READ COMMITTED): exclui reversões
  --    commitadas enquanto esperávamos o lock.
  SELECT
    coalesce(array_agg(ce.id ORDER BY ce.created_at), '{}'::uuid[]),
    coalesce(sum(ce.amount), 0)
  INTO v_ids, v_gross
  FROM public.commission_entries ce
  WHERE ce.id = ANY (v_locked)
    AND ce.barbershop_id = p_barbershop_id
    AND ce.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_entries r
      WHERE r.barbershop_id = p_barbershop_id
        AND r.status = 'reversed' AND r.reversal_of = ce.id
    );

  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    payout_id := NULL;
    count := 0;
    gross := 0;
    advances_deducted := 0;
    net := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_remaining := v_gross;

  -- Vales abertos/parcial (mais antigos primeiro) — P24 dedução parcial
  FOR v_adv IN
    SELECT sa.*
    FROM public.staff_advances sa
    WHERE sa.barbershop_id = p_barbershop_id
      AND sa.barber_id = p_barber_id
      AND sa.status IN ('open', 'partially_deducted')
      AND sa.deducted_amount < sa.amount
    ORDER BY sa.created_at ASC
    FOR UPDATE OF sa
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := least(v_remaining, v_adv.amount - v_adv.deducted_amount);
    IF v_take <= 0 THEN CONTINUE; END IF;
    v_deduct := v_deduct + v_take;
    v_remaining := v_remaining - v_take;
    v_adv_ids := array_append(v_adv_ids, v_adv.id);
    v_adv_amts := array_append(v_adv_amts, v_take);
  END LOOP;

  INSERT INTO public.commission_payouts (
    barbershop_id, barber_id, gross, advances_deducted, net, created_by
  ) VALUES (
    p_barbershop_id, p_barber_id, v_gross, v_deduct,
    round((v_gross - v_deduct)::numeric, 2), p_actor
  )
  RETURNING id INTO v_payout;

  IF coalesce(array_length(v_adv_ids, 1), 0) > 0 THEN
    FOR i IN 1 .. array_length(v_adv_ids, 1)
    LOOP
      INSERT INTO public.staff_advance_deductions (
        barbershop_id, advance_id, payout_id, amount
      ) VALUES (p_barbershop_id, v_adv_ids[i], v_payout, v_adv_amts[i]);

      UPDATE public.staff_advances sa
      SET
        deducted_amount = sa.deducted_amount + v_adv_amts[i],
        status = CASE
          WHEN sa.deducted_amount + v_adv_amts[i] >= sa.amount THEN 'deducted'
          ELSE 'partially_deducted'
        END,
        deducted_at = CASE
          WHEN sa.deducted_amount + v_adv_amts[i] >= sa.amount THEN now()
          ELSE sa.deducted_at
        END
      WHERE sa.id = v_adv_ids[i] AND sa.barbershop_id = p_barbershop_id;
    END LOOP;
  END IF;

  UPDATE public.commission_entries ce
  SET
    status = 'paid',
    paid_at = now(),
    payout_batch_id = v_payout
  WHERE ce.id = ANY (v_ids)
    AND ce.barbershop_id = p_barbershop_id
    AND ce.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_entries r
      WHERE r.barbershop_id = p_barbershop_id
        AND r.status = 'reversed' AND r.reversal_of = ce.id
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;

  payout_id := v_payout;
  count := v_n;
  gross := v_gross;
  advances_deducted := v_deduct;
  net := round((v_gross - v_deduct)::numeric, 2);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.ops_pay_commissions(uuid, uuid, text) IS
  'Paga pending do barbeiro. Após FOR UPDATE, refiltra reversões em novo statement '
  '(READ COMMITTED) — reverse só INSERE e não dispara recheck do FOR UPDATE.';

CREATE OR REPLACE FUNCTION public.ops_barber_ranking(
  p_barbershop_id UUID,
  p_month TEXT DEFAULT NULL
)
RETURNS TABLE (
  barber_id UUID,
  revenue NUMERIC,
  services INT,
  commission NUMERIC,
  revenue_target NUMERIC,
  services_target INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_month TEXT := coalesce(p_month, to_char(now(), 'YYYY-MM'));
BEGIN
  RETURN QUERY
  WITH sales_agg AS (
    SELECT
      s.barber_id AS bid,
      coalesce(sum(s.total), 0)::numeric AS rev,
      count(*)::int AS svc
    FROM public.sales s
    WHERE s.barbershop_id = p_barbershop_id
      AND s.status = 'paid'
      AND s.barber_id IS NOT NULL
      AND to_char(s.created_at, 'YYYY-MM') = v_month
    GROUP BY s.barber_id
  ),
  comm_agg AS (
    SELECT
      ce.barber_id AS bid,
      coalesce(sum(ce.amount), 0)::numeric AS comm
    FROM public.commission_entries ce
    WHERE ce.barbershop_id = p_barbershop_id
      AND to_char(ce.created_at, 'YYYY-MM') = v_month
      AND ce.status IN ('pending', 'paid')
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_entries r
        WHERE r.barbershop_id = p_barbershop_id
          AND r.status = 'reversed' AND r.reversal_of = ce.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_entries c
        WHERE c.barbershop_id = p_barbershop_id
          AND c.status = 'clawback' AND c.clawback_of = ce.id
      )
    GROUP BY ce.barber_id
  ),
  ids AS (
    SELECT bid FROM sales_agg
    UNION
    SELECT bid FROM comm_agg
  )
  SELECT
    i.bid,
    coalesce(sa.rev, 0),
    coalesce(sa.svc, 0),
    coalesce(ca.comm, 0),
    g.revenue_target,
    g.services_target
  FROM ids i
  LEFT JOIN sales_agg sa ON sa.bid = i.bid
  LEFT JOIN comm_agg ca ON ca.bid = i.bid
  LEFT JOIN public.barber_goals g
    ON g.barbershop_id = p_barbershop_id
   AND g.barber_id = i.bid
   AND g.month = v_month
  ORDER BY coalesce(sa.rev, 0) DESC;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ops_accrue_commission(uuid,uuid)',
    'ops_reverse_pending_commissions(uuid,uuid)',
    'ops_clawback_commission(uuid,uuid,text)',
    'ops_pay_commissions(uuid,uuid,text)',
    'ops_barber_ranking(uuid,text)'
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
