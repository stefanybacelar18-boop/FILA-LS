-- Fase 1.B.6 — Prep compras/contas a pagar (local/CI; prod continua json).
-- D3 / D5 / P18 / P29–P31. Sem alterar fluxos JSON.
-- Receive usa ops_adjust_stock (1.B.1).

-- ═══════════════════════════════════════════════════════════════════════════
-- Pré-condições UNIQUE (id, barbershop_id)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='suppliers')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='suppliers_id_barbershop_uidx') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_id_barbershop_uidx') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- purchase_orders + items
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'ordered', 'received', 'canceled')),
  notes TEXT,
  total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NULL,
  received_by TEXT NULL,
  canceled_at TIMESTAMPTZ NULL,
  UNIQUE (id, barbershop_id),
  CHECK ((status = 'received') = (received_at IS NOT NULL))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_orders_supplier_tenant_fkey') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='suppliers_id_barbershop_uidx') THEN
      RAISE EXCEPTION 'fase1b_06: pré-condição suppliers_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_supplier_tenant_fkey
      FOREIGN KEY (supplier_id, barbershop_id)
      REFERENCES public.suppliers (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL,
  purchase_order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  FOREIGN KEY (purchase_order_id, barbershop_id)
    REFERENCES public.purchase_orders (id, barbershop_id) ON DELETE RESTRICT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_order_items_product_tenant_fkey') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_id_barbershop_uidx') THEN
      RAISE EXCEPTION 'fase1b_06: pré-condição products_id_barbershop_uidx ausente';
    END IF;
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_product_tenant_fkey
      FOREIGN KEY (product_id, barbershop_id)
      REFERENCES public.products (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purchase_order_items_immutable_after_ordered()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT po.status INTO v_status
  FROM public.purchase_orders po
  WHERE po.id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
    AND po.barbershop_id = COALESCE(NEW.barbershop_id, OLD.barbershop_id);
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'purchase_order_items imutáveis após ordered';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS purchase_order_items_immutable_trg ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_immutable_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE PROCEDURE public.purchase_order_items_immutable_after_ordered();

-- ═══════════════════════════════════════════════════════════════════════════
-- payables (endurecer legado)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  category TEXT DEFAULT 'Variável',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'canceled')),
  paid_at TIMESTAMPTZ NULL,
  paid_by TEXT NULL,
  canceled_at TIMESTAMPTZ NULL,
  purchase_order_id UUID NULL,
  UNIQUE (id, barbershop_id),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);

DO $$
DECLARE r RECORD;
BEGIN
  -- CASCADE → RESTRICT
  FOR r IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='payables' AND c.contype='f'
      AND pg_get_constraintdef(c.oid) ILIKE '%barbershops%'
      AND pg_get_constraintdef(c.oid) ILIKE '%CASCADE%'
  LOOP
    EXECUTE format('ALTER TABLE public.payables DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payables_barbershop_id_fkey') THEN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_barbershop_id_fkey
      FOREIGN KEY (barbershop_id) REFERENCES public.barbershops(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payables_id_barbershop_uidx') THEN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;

  ALTER TABLE public.payables ADD COLUMN IF NOT EXISTS paid_by TEXT;
  ALTER TABLE public.payables ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
  ALTER TABLE public.payables ADD COLUMN IF NOT EXISTS purchase_order_id UUID;

  BEGIN
    ALTER TABLE public.payables ALTER COLUMN amount TYPE NUMERIC(12,2);
  EXCEPTION WHEN others THEN NULL;
  END;

  -- status check widen
  BEGIN
    ALTER TABLE public.payables DROP CONSTRAINT IF EXISTS payables_status_check;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_status_check
      CHECK (status IN ('open', 'paid', 'canceled'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_amount_ck CHECK (amount > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_paid_at_ck
      CHECK ((status = 'paid') = (paid_at IS NOT NULL));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payables_po_tenant_fkey') THEN
    ALTER TABLE public.payables
      ADD CONSTRAINT payables_po_tenant_fkey
      FOREIGN KEY (purchase_order_id, barbershop_id)
      REFERENCES public.purchase_orders (id, barbershop_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payables_purchase_order_uidx
  ON public.payables (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.payables_status_transitions()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payables: DELETE proibido';
  END IF;
  IF OLD.status = 'open' AND NEW.status IN ('paid', 'canceled') THEN
    -- demais campos imutáveis exceto status/paid_at/paid_by/canceled_at
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.barbershop_id IS DISTINCT FROM OLD.barbershop_id
       OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
    THEN
      RAISE EXCEPTION 'payables: campos imutáveis no pagamento/cancelamento';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status AND OLD.status = 'open' THEN
    RETURN NEW; -- editar open ok
  END IF;
  RAISE EXCEPTION 'payables: só open→paid / open→canceled (ou editar open)';
END;
$$;
DROP TRIGGER IF EXISTS payables_status_transitions_trg ON public.payables;
CREATE TRIGGER payables_status_transitions_trg
  BEFORE UPDATE OR DELETE ON public.payables
  FOR EACH ROW EXECUTE PROCEDURE public.payables_status_transitions();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_orders','purchase_order_items','payables'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_tenant_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (barbershop_id = public.user_barbershop_id())',
      t||'_tenant_select', t
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_create_purchase_order(
  p_barbershop_id UUID,
  p_supplier_id UUID,
  p_items JSONB,
  p_notes TEXT,
  p_actor TEXT
)
RETURNS TABLE (
  purchase_order_id UUID,
  total_cost NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_po UUID;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_pid UUID;
  v_qty INT;
  v_cost NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'PO_ITEMS_REQUIRED' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = p_supplier_id AND s.barbershop_id = p_barbershop_id
  ) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- total pré-cálculo
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_cost := (v_item->>'unit_cost')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR v_cost IS NULL OR v_cost < 0 THEN
      RAISE EXCEPTION 'PO_ITEM_INVALID' USING ERRCODE = 'PT409';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_pid AND p.barbershop_id = p_barbershop_id
    ) THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    v_total := v_total + round((v_qty * v_cost)::numeric, 2);
  END LOOP;

  -- draft → insert items → ordered (trigger permite insert em draft)
  INSERT INTO public.purchase_orders (
    barbershop_id, supplier_id, status, notes, total_cost, created_by
  ) VALUES (
    p_barbershop_id, p_supplier_id, 'draft', p_notes, v_total, p_actor
  )
  RETURNING id INTO v_po;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.purchase_order_items (
      barbershop_id, purchase_order_id, product_id, quantity, unit_cost
    ) VALUES (
      p_barbershop_id, v_po,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int,
      (v_item->>'unit_cost')::numeric
    );
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'ordered'
  WHERE id = v_po AND barbershop_id = p_barbershop_id;

  purchase_order_id := v_po;
  total_cost := v_total;
  status := 'ordered';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_receive_purchase_order(
  p_barbershop_id UUID,
  p_po_id UUID,
  p_actor TEXT
)
RETURNS TABLE (
  purchase_order_id UUID,
  payable_id UUID,
  total_cost NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_item RECORD;
  v_pay UUID;
  v_existing UUID;
BEGIN
  SELECT * INTO v_po
  FROM public.purchase_orders po
  WHERE po.id = p_po_id AND po.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'PO_ALREADY_RECEIVED' USING ERRCODE = 'PT409';
  END IF;
  IF v_po.status = 'canceled' THEN
    RAISE EXCEPTION 'PO_CANCELED' USING ERRCODE = 'PT409';
  END IF;
  IF v_po.status <> 'ordered' THEN
    RAISE EXCEPTION 'PO_NOT_ORDERED' USING ERRCODE = 'PT409';
  END IF;

  FOR v_item IN
    SELECT * FROM public.purchase_order_items i
    WHERE i.purchase_order_id = p_po_id AND i.barbershop_id = p_barbershop_id
  LOOP
    PERFORM public.ops_adjust_stock(
      p_barbershop_id,
      v_item.product_id,
      v_item.quantity,
      'OC ' || p_po_id::text
    );
  END LOOP;

  UPDATE public.purchase_orders AS po
  SET status = 'received', received_at = now(), received_by = p_actor
  WHERE po.id = p_po_id AND po.barbershop_id = p_barbershop_id;

  BEGIN
    INSERT INTO public.payables (
      barbershop_id, description, amount, due_date, category, status, purchase_order_id
    ) VALUES (
      p_barbershop_id,
      'Ordem de compra ' || left(p_po_id::text, 8),
      v_po.total_cost,
      CURRENT_DATE,
      'Compra',
      'open',
      p_po_id
    )
    RETURNING id INTO v_pay;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_existing FROM public.payables
      WHERE purchase_order_id = p_po_id AND barbershop_id = p_barbershop_id;
      v_pay := v_existing;
  END;

  purchase_order_id := p_po_id;
  payable_id := v_pay;
  total_cost := v_po.total_cost;
  status := 'received';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_cancel_purchase_order(
  p_barbershop_id UUID,
  p_po_id UUID,
  p_actor TEXT
)
RETURNS TABLE (purchase_order_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders po
  WHERE po.id = p_po_id AND po.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_po.status = 'canceled' THEN
    purchase_order_id := p_po_id;
    status := 'canceled';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'PO_ALREADY_RECEIVED' USING ERRCODE = 'PT409';
  END IF;
  IF v_po.status NOT IN ('draft', 'ordered') THEN
    RAISE EXCEPTION 'PO_CANNOT_CANCEL' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.purchase_orders AS po
  SET status = 'canceled', canceled_at = now()
  WHERE po.id = p_po_id AND po.barbershop_id = p_barbershop_id;
  purchase_order_id := p_po_id;
  status := 'canceled';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_upsert_payable(
  p_barbershop_id UUID,
  p_id UUID,
  p_description TEXT,
  p_amount NUMERIC,
  p_due_date DATE,
  p_category TEXT,
  p_actor TEXT
)
RETURNS TABLE (
  payable_id UUID,
  amount NUMERIC,
  status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_row public.payables%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'PAYABLE_AMOUNT_INVALID' USING ERRCODE = 'PT409';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.payables p
    WHERE p.id = p_id AND p.barbershop_id = p_barbershop_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PAYABLE_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    IF v_row.status <> 'open' THEN
      RAISE EXCEPTION 'PAYABLE_NOT_OPEN' USING ERRCODE = 'PT409';
    END IF;
    UPDATE public.payables AS p
    SET description = p_description,
        amount = p_amount,
        due_date = p_due_date,
        category = COALESCE(p_category, p.category)
    WHERE p.id = p_id AND p.barbershop_id = p_barbershop_id;
    payable_id := p_id;
    amount := p_amount;
    status := 'open';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.payables (
    barbershop_id, description, amount, due_date, category, status
  ) VALUES (
    p_barbershop_id, p_description, p_amount, p_due_date,
    COALESCE(p_category, 'Variável'), 'open'
  )
  RETURNING id INTO payable_id;
  amount := p_amount;
  status := 'open';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_pay_payable(
  p_barbershop_id UUID,
  p_payable_id UUID,
  p_actor TEXT
)
RETURNS TABLE (payable_id UUID, status TEXT, paid_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_row public.payables%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.payables p
  WHERE p.id = p_payable_id AND p.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYABLE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_row.status = 'paid' THEN
    RAISE EXCEPTION 'PAYABLE_ALREADY_PAID' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.status <> 'open' THEN
    RAISE EXCEPTION 'PAYABLE_NOT_OPEN' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.payables AS p
  SET status = 'paid', paid_at = now(), paid_by = p_actor
  WHERE p.id = p_payable_id AND p.barbershop_id = p_barbershop_id;
  payable_id := p_payable_id;
  status := 'paid';
  paid_at := now();
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ops_cancel_payable(
  p_barbershop_id UUID,
  p_payable_id UUID,
  p_actor TEXT
)
RETURNS TABLE (payable_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_row public.payables%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.payables p
    WHERE p.id = p_payable_id AND p.barbershop_id = p_barbershop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYABLE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  IF v_row.status = 'canceled' THEN
    payable_id := p_payable_id;
    status := 'canceled';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_row.status <> 'open' THEN
    RAISE EXCEPTION 'PAYABLE_NOT_OPEN' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYABLE_FROM_PO' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.payables AS p
  SET status = 'canceled', canceled_at = now()
  WHERE p.id = p_payable_id AND p.barbershop_id = p_barbershop_id;
  payable_id := p_payable_id;
  status := 'canceled';
  RETURN NEXT;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ops_create_purchase_order(uuid,uuid,jsonb,text,text)',
    'ops_receive_purchase_order(uuid,uuid,text)',
    'ops_cancel_purchase_order(uuid,uuid,text)',
    'ops_upsert_payable(uuid,uuid,text,numeric,date,text,text)',
    'ops_pay_payable(uuid,uuid,text)',
    'ops_cancel_payable(uuid,uuid,text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END IF;
  END LOOP;
END $$;
