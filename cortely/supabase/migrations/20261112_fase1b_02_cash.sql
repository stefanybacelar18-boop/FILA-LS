-- Fase 1.B.2 — Prep caixa (cash_sessions/movements + troco) + tenant em sale_*.
-- Local/CI only. Produção continua json. Nome do enum do plano §4.2: "reason" → "kind".

-- ═══════════════════════════════════════════════════════════════════════════
-- a) Tenant em sale_payments / sale_items (§4.3)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS barbershop_id UUID;
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS barbershop_id UUID;

UPDATE public.sale_payments sp
SET barbershop_id = s.barbershop_id
FROM public.sales s
WHERE sp.sale_id = s.id AND sp.barbershop_id IS NULL;

UPDATE public.sale_items si
SET barbershop_id = s.barbershop_id
FROM public.sales s
WHERE si.sale_id = s.id AND si.barbershop_id IS NULL;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.sale_payments WHERE barbershop_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'fase1b_02: % sale_payments órfãos sem barbershop_id (sem sale pai) — corrija antes de migrar',
      n;
  END IF;
  SELECT count(*) INTO n FROM public.sale_items WHERE barbershop_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'fase1b_02: % sale_items órfãos sem barbershop_id (sem sale pai) — corrija antes de migrar',
      n;
  END IF;
END $$;

ALTER TABLE public.sale_payments
  ALTER COLUMN barbershop_id SET NOT NULL;
ALTER TABLE public.sale_items
  ALTER COLUMN barbershop_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.sale_payments
      ADD CONSTRAINT sale_payments_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_sessions_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.cash_sessions
      ADD CONSTRAINT cash_sessions_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_id_barbershop_uidx'
  ) THEN
    -- UNIQUE antecipado (plano §4.2); necessário se FKs compostas apontarem para cá
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
END $$;

-- Trocar FK sale_id simples por composta (sale_id, barbershop_id)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'sale_payments'
      AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%sale_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.sale_payments DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'sale_items'
      AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%sale_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.sale_items DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_sale_tenant_fkey
  FOREIGN KEY (sale_id, barbershop_id)
  REFERENCES public.sales (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_sale_tenant_fkey
  FOREIGN KEY (sale_id, barbershop_id)
  REFERENCES public.sales (id, barbershop_id)
  ON DELETE RESTRICT;

-- Policies diretas por barbershop_id (substituem via JOIN)
DROP POLICY IF EXISTS sale_items_via_sales ON public.sale_items;
DROP POLICY IF EXISTS sale_payments_via_sales ON public.sale_payments;
DROP POLICY IF EXISTS sale_items_tenant_all ON public.sale_items;
DROP POLICY IF EXISTS sale_payments_tenant_all ON public.sale_payments;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY sale_items_tenant_all ON public.sale_items
  FOR ALL TO authenticated
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

CREATE POLICY sale_payments_tenant_all ON public.sale_payments
  FOR ALL TO authenticated
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- b) sale_payments: tendered_amount / applied_amount
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS tendered_amount NUMERIC(12,2);
ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(12,2);

UPDATE public.sale_payments
SET
  tendered_amount = COALESCE(tendered_amount, amount),
  applied_amount = COALESCE(applied_amount, amount)
WHERE tendered_amount IS NULL OR applied_amount IS NULL;

ALTER TABLE public.sale_payments
  ALTER COLUMN tendered_amount SET NOT NULL,
  ALTER COLUMN applied_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_tendered_applied_ck'
  ) THEN
    ALTER TABLE public.sale_payments
      ADD CONSTRAINT sale_payments_tendered_applied_ck
      CHECK (tendered_amount >= applied_amount AND applied_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_noncash_no_change_ck'
  ) THEN
    ALTER TABLE public.sale_payments
      ADD CONSTRAINT sale_payments_noncash_no_change_ck
      CHECK (method = 'cash' OR tendered_amount = applied_amount);
  END IF;
END $$;

COMMENT ON COLUMN public.sale_payments.amount IS
  'Compatibilidade pré-cutover; remover no cutover 1.B.3 — usar tendered/applied.';
COMMENT ON COLUMN public.sale_payments.tendered_amount IS
  'Valor tendered (D4); troco = tendered - applied só em cash.';
COMMENT ON COLUMN public.sale_payments.applied_amount IS
  'Valor aplicado à venda; Σ applied = sales.total.';

-- ═══════════════════════════════════════════════════════════════════════════
-- c) cash_sessions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS difference NUMERIC(12,2);

ALTER TABLE public.cash_sessions
  ALTER COLUMN opening_amount TYPE NUMERIC(12,2)
    USING opening_amount::NUMERIC(12,2);
ALTER TABLE public.cash_sessions
  ALTER COLUMN closing_amount TYPE NUMERIC(12,2)
    USING closing_amount::NUMERIC(12,2);
ALTER TABLE public.cash_sessions
  ALTER COLUMN expected_cash TYPE NUMERIC(12,2)
    USING expected_cash::NUMERIC(12,2);
ALTER TABLE public.cash_sessions
  ALTER COLUMN difference TYPE NUMERIC(12,2)
    USING difference::NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_sessions_status_ck'
  ) THEN
    ALTER TABLE public.cash_sessions
      ADD CONSTRAINT cash_sessions_status_ck
      CHECK (status IN ('open', 'closed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_shop_uidx
  ON public.cash_sessions (barbershop_id)
  WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════════════════
-- d) cash_movements: direction + kind (plano §4.2 "reason" → "kind")
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS sale_payment_id UUID;

-- Backfill a partir do type legado sangria/suprimento
UPDATE public.cash_movements
SET
  direction = CASE
    WHEN type = 'suprimento' THEN 'in'
    WHEN type = 'sangria' THEN 'out'
    ELSE direction
  END,
  kind = CASE
    WHEN type = 'suprimento' THEN 'manual_in'
    WHEN type = 'sangria' THEN 'manual_out'
    ELSE kind
  END
WHERE direction IS NULL OR kind IS NULL;

-- Se ainda houver linhas sem type conhecido, falha explícita
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.cash_movements
  WHERE direction IS NULL OR kind IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION
      'fase1b_02: % cash_movements sem direction/kind após backfill', n;
  END IF;
END $$;

ALTER TABLE public.cash_movements
  ALTER COLUMN direction SET NOT NULL,
  ALTER COLUMN kind SET NOT NULL;

-- Remover CHECK/coluna type legado
ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_type_check;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_movements'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.cash_movements DROP COLUMN type;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_direction_ck'
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_direction_ck
      CHECK (direction IN ('in', 'out'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_kind_ck'
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_kind_ck
      CHECK (kind IN (
        'sale_cash_in', 'change', 'manual_in', 'manual_out',
        'refund_in', 'refund_out'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_amount_pos_ck'
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_amount_pos_ck CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_change_payment_ck'
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_change_payment_ck
      CHECK (kind <> 'change' OR sale_payment_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_change_out_ck'
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_change_out_ck
      CHECK (kind <> 'change' OR direction = 'out');
  END IF;
END $$;

ALTER TABLE public.cash_movements
  ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);

COMMENT ON COLUMN public.cash_movements.kind IS
  'Enum operacional (plano §4.2 chamava de reason); reason TEXT permanece descrição livre.';
COMMENT ON COLUMN public.cash_movements.reason IS
  'Descrição livre (UI); não é o enum — ver coluna kind.';

-- FKs compostas: session RESTRICT; sale_payment opcional
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'cash_movements'
      AND c.contype = 'f'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%cash_session%'
        OR pg_get_constraintdef(c.oid) ILIKE '%sale_payment%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.cash_movements DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_session_tenant_fkey
  FOREIGN KEY (cash_session_id, barbershop_id)
  REFERENCES public.cash_sessions (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_payment_tenant_fkey
  FOREIGN KEY (sale_payment_id, barbershop_id)
  REFERENCES public.sale_payments (id, barbershop_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS cash_sessions_barbershop_idx
  ON public.cash_sessions (barbershop_id);
CREATE INDEX IF NOT EXISTS cash_movements_barbershop_idx
  ON public.cash_movements (barbershop_id);
CREATE INDEX IF NOT EXISTS cash_movements_session_idx
  ON public.cash_movements (barbershop_id, cash_session_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- e) Append-only cash_movements + RLS/grants
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.cash_sessions FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.cash_movements FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.sale_payments FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.sale_items FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.cash_sessions FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.cash_movements FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.sale_payments FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.sale_items FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash_sessions TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_payments TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_items TO authenticated';
    -- append-only
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.cash_movements TO authenticated';
  END IF;
END $$;

DROP POLICY IF EXISTS cash_movements_tenant_all ON public.cash_movements;
DROP POLICY IF EXISTS cash_movements_tenant_select ON public.cash_movements;
DROP POLICY IF EXISTS cash_movements_tenant_insert ON public.cash_movements;
CREATE POLICY cash_movements_tenant_select ON public.cash_movements
  FOR SELECT TO authenticated
  USING (barbershop_id = public.user_barbershop_id());
CREATE POLICY cash_movements_tenant_insert ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (barbershop_id = public.user_barbershop_id());

DROP POLICY IF EXISTS cash_sessions_tenant_all ON public.cash_sessions;
CREATE POLICY cash_sessions_tenant_all ON public.cash_sessions
  FOR ALL TO authenticated
  USING (barbershop_id = public.user_barbershop_id())
  WITH CHECK (barbershop_id = public.user_barbershop_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções atômicas (EXECUTE só service_role — antecipa P18)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_open_cash(
  p_barbershop_id UUID,
  p_opened_by TEXT,
  p_opening_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  barbershop_id UUID,
  opened_by TEXT,
  opening_amount NUMERIC,
  status TEXT,
  opened_at TIMESTAMPTZ,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_opened TIMESTAMPTZ;
BEGIN
  IF p_opening_amount IS NULL OR p_opening_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_OPENING' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_sessions cs
    WHERE cs.barbershop_id = p_barbershop_id AND cs.status = 'open'
  ) THEN
    RAISE EXCEPTION 'CASH_ALREADY_OPEN'
      USING ERRCODE = 'PT409', HINT = 'one open session per barbershop';
  END IF;

  BEGIN
    INSERT INTO public.cash_sessions (
      barbershop_id, opened_by, opening_amount, status, notes
    ) VALUES (
      p_barbershop_id, p_opened_by, p_opening_amount, 'open', p_notes
    )
    RETURNING id, cash_sessions.opened_at INTO v_id, v_opened;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CASH_ALREADY_OPEN'
      USING ERRCODE = 'PT409', HINT = 'concurrent open';
  END;

  session_id := v_id;
  barbershop_id := p_barbershop_id;
  opened_by := p_opened_by;
  opening_amount := p_opening_amount;
  status := 'open';
  opened_at := v_opened;
  notes := p_notes;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_add_cash_movement(
  p_barbershop_id UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_created_by TEXT
)
RETURNS TABLE (
  movement_id UUID,
  cash_session_id UUID,
  barbershop_id UUID,
  direction TEXT,
  kind TEXT,
  amount NUMERIC,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session UUID;
  v_dir TEXT;
  v_id UUID;
  v_created TIMESTAMPTZ;
BEGIN
  IF p_kind NOT IN ('manual_in', 'manual_out') THEN
    RAISE EXCEPTION 'INVALID_MANUAL_KIND' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  v_dir := CASE WHEN p_kind = 'manual_in' THEN 'in' ELSE 'out' END;

  SELECT cs.id INTO v_session
  FROM public.cash_sessions cs
  WHERE cs.barbershop_id = p_barbershop_id AND cs.status = 'open'
  FOR UPDATE;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'CASH_NOT_OPEN'
      USING ERRCODE = 'PT409', HINT = 'open cash first';
  END IF;

  INSERT INTO public.cash_movements AS cm (
    barbershop_id, cash_session_id, direction, kind, amount, reason, created_by
  ) VALUES (
    p_barbershop_id, v_session, v_dir, p_kind, p_amount,
    COALESCE(p_reason, p_kind), p_created_by
  )
  RETURNING cm.id, cm.created_at INTO v_id, v_created;

  movement_id := v_id;
  cash_session_id := v_session;
  barbershop_id := p_barbershop_id;
  direction := v_dir;
  kind := p_kind;
  amount := p_amount;
  reason := COALESCE(p_reason, p_kind);
  created_by := p_created_by;
  created_at := v_created;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_cash_conference(
  p_barbershop_id UUID,
  p_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  opening_amount NUMERIC,
  expected_cash NUMERIC,
  ledger_in NUMERIC,
  ledger_out NUMERIC,
  by_method JSONB,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_in NUMERIC;
  v_out NUMERIC;
  v_by JSONB;
BEGIN
  IF p_session_id IS NULL THEN
    SELECT * INTO v_session
    FROM public.cash_sessions cs
    WHERE cs.barbershop_id = p_barbershop_id AND cs.status = 'open'
    LIMIT 1;
  ELSE
    SELECT * INTO v_session
    FROM public.cash_sessions cs
    WHERE cs.id = p_session_id AND cs.barbershop_id = p_barbershop_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0)
  INTO v_in, v_out
  FROM public.cash_movements cm
  WHERE cm.cash_session_id = v_session.id
    AND cm.barbershop_id = p_barbershop_id;

  SELECT COALESCE(jsonb_object_agg(method, total), '{}'::jsonb)
  INTO v_by
  FROM (
    SELECT sp.method, SUM(sp.applied_amount) AS total
    FROM public.sale_payments sp
    JOIN public.sales s
      ON s.id = sp.sale_id AND s.barbershop_id = sp.barbershop_id
    WHERE s.cash_session_id = v_session.id
      AND s.barbershop_id = p_barbershop_id
      AND s.status = 'paid'
    GROUP BY sp.method
  ) t;

  session_id := v_session.id;
  opening_amount := v_session.opening_amount;
  expected_cash := round((v_session.opening_amount + v_in - v_out)::numeric, 2);
  ledger_in := v_in;
  ledger_out := v_out;
  by_method := v_by;
  status := v_session.status;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_close_cash(
  p_barbershop_id UUID,
  p_closed_by TEXT,
  p_closing_amount NUMERIC
)
RETURNS TABLE (
  session_id UUID,
  barbershop_id UUID,
  status TEXT,
  opening_amount NUMERIC,
  closing_amount NUMERIC,
  expected_cash NUMERIC,
  difference NUMERIC,
  closed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_conf RECORD;
  v_closed TIMESTAMPTZ;
BEGIN
  IF p_closing_amount IS NULL OR p_closing_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_CLOSING' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions cs
  WHERE cs.barbershop_id = p_barbershop_id AND cs.status = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_NOT_OPEN'
      USING ERRCODE = 'PT409', HINT = 'already closed or missing';
  END IF;

  SELECT * INTO v_conf
  FROM public.ops_cash_conference(p_barbershop_id, v_session.id);

  v_closed := now();
  UPDATE public.cash_sessions cs
  SET
    status = 'closed',
    closed_by = p_closed_by,
    closing_amount = p_closing_amount,
    expected_cash = v_conf.expected_cash,
    difference = round((p_closing_amount - v_conf.expected_cash)::numeric, 2),
    closed_at = v_closed
  WHERE cs.id = v_session.id AND cs.barbershop_id = p_barbershop_id
    AND cs.status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASH_ALREADY_CLOSED'
      USING ERRCODE = 'PT409';
  END IF;

  session_id := v_session.id;
  barbershop_id := p_barbershop_id;
  status := 'closed';
  opening_amount := v_session.opening_amount;
  closing_amount := p_closing_amount;
  expected_cash := v_conf.expected_cash;
  difference := round((p_closing_amount - v_conf.expected_cash)::numeric, 2);
  closed_at := v_closed;
  RETURN NEXT;
END;
$$;

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ops_open_cash(uuid,text,numeric,text)',
    'ops_add_cash_movement(uuid,text,numeric,text,text)',
    'ops_cash_conference(uuid,uuid)',
    'ops_close_cash(uuid,text,numeric)'
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
