-- Fase 1.B.1 — Prep products/stock/inventory (local/CI only; prod continua json).
-- Reforça FKs compostas, CHECKs, índices, append-only em stock_movements,
-- e funções atômicas SECURITY INVOKER.

-- ── Unique (id, barbershop_id) para FKs compostas ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'suppliers_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
END $$;

-- ── Tipagem / CHECKs em products ───────────────────────────────────────────
ALTER TABLE public.products
  ALTER COLUMN price TYPE NUMERIC(12,2) USING price::NUMERIC(12,2),
  ALTER COLUMN cost TYPE NUMERIC(12,2) USING cost::NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_qty_nonneg_ck'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_qty_nonneg_ck CHECK (stock_qty >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_price_nonneg_ck'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_price_nonneg_ck CHECK (price >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonneg_ck'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cost_nonneg_ck CHECK (cost >= 0);
  END IF;
END $$;

-- ── inventory_counts: difference = counted_qty - system_qty ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_counts_difference_ck'
  ) THEN
    ALTER TABLE public.inventory_counts
      ADD CONSTRAINT inventory_counts_difference_ck
      CHECK (difference = counted_qty - system_qty);
  END IF;
END $$;

-- ── FKs: dropar CASCADE simples e recriar compostas RESTRICT ──────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  -- stock_movements.product_id → products
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'stock_movements'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%product_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.stock_movements DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- inventory_counts.product_id → products
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inventory_counts'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%product_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.inventory_counts DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- products.supplier_id (se houver FK simples)
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'products'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%supplier%'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_product_tenant_fkey
  FOREIGN KEY (product_id, barbershop_id)
  REFERENCES public.products (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_product_tenant_fkey
  FOREIGN KEY (product_id, barbershop_id)
  REFERENCES public.products (id, barbershop_id)
  ON DELETE RESTRICT;

ALTER TABLE public.products
  ADD CONSTRAINT products_supplier_tenant_fkey
  FOREIGN KEY (supplier_id, barbershop_id)
  REFERENCES public.suppliers (id, barbershop_id)
  ON DELETE RESTRICT;

-- ── Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS products_barbershop_idx
  ON public.products (barbershop_id);
CREATE INDEX IF NOT EXISTS products_barbershop_product_idx
  ON public.products (barbershop_id, id);
CREATE INDEX IF NOT EXISTS stock_movements_barbershop_idx
  ON public.stock_movements (barbershop_id);
CREATE INDEX IF NOT EXISTS stock_movements_barbershop_product_idx
  ON public.stock_movements (barbershop_id, product_id);
CREATE INDEX IF NOT EXISTS inventory_counts_barbershop_idx
  ON public.inventory_counts (barbershop_id);
CREATE INDEX IF NOT EXISTS inventory_counts_barbershop_product_idx
  ON public.inventory_counts (barbershop_id, product_id);
CREATE INDEX IF NOT EXISTS suppliers_barbershop_idx
  ON public.suppliers (barbershop_id);

-- ── RLS ENABLE+FORCE (idempotente; padrão 1.A) ─────────────────────────────
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'suppliers', 'stock_movements', 'inventory_counts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      INTO r
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    IF NOT r.rls OR NOT r.force_rls THEN
      RAISE EXCEPTION
        'Falha de segurança: public.% deve ter ENABLE+FORCE RLS', t;
    END IF;
  END LOOP;
END $$;

-- ── Grants: padrão 1.A + stock_movements append-only ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.products FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.suppliers FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.stock_movements FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.inventory_counts FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.products FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.suppliers FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.stock_movements FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.inventory_counts FROM authenticated';

    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_counts TO authenticated';
    -- append-only: sem UPDATE/DELETE
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.stock_movements TO authenticated';
  END IF;
END $$;

REVOKE ALL ON TABLE public.products FROM PUBLIC;
REVOKE ALL ON TABLE public.suppliers FROM PUBLIC;
REVOKE ALL ON TABLE public.stock_movements FROM PUBLIC;
REVOKE ALL ON TABLE public.inventory_counts FROM PUBLIC;

-- Policies stock_movements: SELECT+INSERT only (append-only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements'
      AND policyname = 'stock_movements_tenant_all'
  ) THEN
    DROP POLICY stock_movements_tenant_all ON public.stock_movements;
  END IF;
  DROP POLICY IF EXISTS stock_movements_tenant_select ON public.stock_movements;
  DROP POLICY IF EXISTS stock_movements_tenant_insert ON public.stock_movements;
  CREATE POLICY stock_movements_tenant_select ON public.stock_movements
    FOR SELECT TO authenticated
    USING (barbershop_id = public.user_barbershop_id());
  CREATE POLICY stock_movements_tenant_insert ON public.stock_movements
    FOR INSERT TO authenticated
    WITH CHECK (barbershop_id = public.user_barbershop_id());
END $$;

-- ── Função: ajuste atômico de estoque ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_adjust_stock(
  p_barbershop_id UUID,
  p_product_id UUID,
  p_delta INT,
  p_reason TEXT
)
RETURNS TABLE (
  product_id UUID,
  barbershop_id UUID,
  stock_qty INT,
  movement_id UUID,
  delta INT,
  reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_stock INT;
  v_mov_id UUID;
  v_created TIMESTAMPTZ;
  v_exists BOOLEAN;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'STOCK_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.products AS p
  SET stock_qty = p.stock_qty + p_delta
  WHERE p.id = p_product_id
    AND p.barbershop_id = p_barbershop_id
    AND p.stock_qty + p_delta >= 0
  RETURNING p.stock_qty INTO v_stock;

  IF NOT FOUND THEN
    SELECT EXISTS (
      SELECT 1 FROM public.products AS p2
      WHERE p2.id = p_product_id AND p2.barbershop_id = p_barbershop_id
    ) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND'
        USING ERRCODE = 'PT404',
              HINT = 'product missing in tenant';
    END IF;
    RAISE EXCEPTION 'INSUFFICIENT_STOCK'
      USING ERRCODE = 'PT409',
            HINT = 'stock_qty + delta would be negative';
  END IF;

  INSERT INTO public.stock_movements AS sm (
    barbershop_id, product_id, delta, reason
  ) VALUES (
    p_barbershop_id, p_product_id, p_delta, p_reason
  )
  RETURNING sm.id, sm.created_at
  INTO v_mov_id, v_created;

  product_id := p_product_id;
  barbershop_id := p_barbershop_id;
  stock_qty := v_stock;
  movement_id := v_mov_id;
  delta := p_delta;
  reason := p_reason;
  created_at := v_created;
  RETURN NEXT;
END;
$$;

-- ── Função: contagem de inventário + ajuste na mesma TX ────────────────────
CREATE OR REPLACE FUNCTION public.ops_register_inventory_count(
  p_barbershop_id UUID,
  p_product_id UUID,
  p_counted_qty INT,
  p_counted_by TEXT
)
RETURNS TABLE (
  count_id UUID,
  product_id UUID,
  barbershop_id UUID,
  system_qty INT,
  counted_qty INT,
  difference INT,
  counted_by TEXT,
  created_at TIMESTAMPTZ,
  stock_qty INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_system INT;
  v_diff INT;
  v_count_id UUID;
  v_created TIMESTAMPTZ;
  v_stock INT;
BEGIN
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'INVALID_COUNTED_QTY' USING ERRCODE = '22023';
  END IF;

  SELECT p.stock_qty INTO v_system
  FROM public.products AS p
  WHERE p.id = p_product_id AND p.barbershop_id = p_barbershop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND'
      USING ERRCODE = 'PT404',
            HINT = 'product missing in tenant';
  END IF;

  v_diff := p_counted_qty - v_system;

  INSERT INTO public.inventory_counts AS ic (
    barbershop_id, product_id, system_qty, counted_qty, difference, counted_by
  ) VALUES (
    p_barbershop_id, p_product_id, v_system, p_counted_qty, v_diff, p_counted_by
  )
  RETURNING ic.id, ic.created_at INTO v_count_id, v_created;

  v_stock := v_system;
  IF v_diff <> 0 THEN
    SELECT s.stock_qty INTO v_stock
    FROM public.ops_adjust_stock(
      p_barbershop_id,
      p_product_id,
      v_diff,
      'Inventário ' || left(v_count_id::text, 8)
    ) AS s;
  END IF;

  count_id := v_count_id;
  product_id := p_product_id;
  barbershop_id := p_barbershop_id;
  system_qty := v_system;
  counted_qty := p_counted_qty;
  difference := v_diff;
  counted_by := p_counted_by;
  created_at := v_created;
  stock_qty := v_stock;
  RETURN NEXT;
END;
$$;

-- EXECUTE: authenticated (+ service_role se existir); nunca anon
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.ops_adjust_stock(UUID, UUID, INT, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.ops_register_inventory_count(UUID, UUID, INT, TEXT) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ops_adjust_stock(UUID, UUID, INT, TEXT) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ops_register_inventory_count(UUID, UUID, INT, TEXT) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ops_adjust_stock(UUID, UUID, INT, TEXT) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ops_register_inventory_count(UUID, UUID, INT, TEXT) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ops_adjust_stock(UUID, UUID, INT, TEXT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ops_register_inventory_count(UUID, UUID, INT, TEXT) TO service_role';
  END IF;
END $$;
