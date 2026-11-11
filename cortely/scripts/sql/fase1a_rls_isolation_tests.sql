-- =============================================================================
-- Seed dois tenants + asserts de isolamento (sale_items / sale_payments + ops)
-- Roda após harness + migrations 03 e 06. Papel autenticado + auth.uid().
-- =============================================================================

\set ON_ERROR_STOP on

-- IDs fixos
SELECT set_config('test.shop_a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('test.shop_b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('test.user_a', '11111111-1111-4111-8111-1111111111a1', false);
SELECT set_config('test.user_b', '22222222-2222-4222-8222-2222222222b2', false);
SELECT set_config('test.sale_a', '33333333-3333-4333-8333-3333333333a1', false);
SELECT set_config('test.sale_b', '44444444-4444-4444-8444-4444444444b2', false);
SELECT set_config('test.item_a', '55555555-5555-4555-8555-5555555555a1', false);
SELECT set_config('test.item_b', '66666666-6666-4666-8666-6666666666b2', false);
SELECT set_config('test.pay_a', '77777777-7777-4777-8777-7777777777a1', false);
SELECT set_config('test.pay_b', '88888888-8888-4888-8888-8888888888b2', false);

INSERT INTO public.barbershops (id, name, slug, phone) VALUES
  (current_setting('test.shop_a')::uuid, 'Barbearia A', 'shop-a', '11000000000'),
  (current_setting('test.shop_b')::uuid, 'Barbearia B', 'shop-b', '22000000000');

INSERT INTO public.profiles (
  id, barbershop_id, full_name, email, role, is_active, provisioning_status
) VALUES
  (current_setting('test.user_a')::uuid, current_setting('test.shop_a')::uuid,
   'Owner A', 'a@test.local', 'owner', TRUE, 'ready'),
  (current_setting('test.user_b')::uuid, current_setting('test.shop_b')::uuid,
   'Owner B', 'b@test.local', 'owner', TRUE, 'ready');

INSERT INTO public.sales (id, barbershop_id, total) VALUES
  (current_setting('test.sale_a')::uuid, current_setting('test.shop_a')::uuid, 100),
  (current_setting('test.sale_b')::uuid, current_setting('test.shop_b')::uuid, 200);

INSERT INTO public.sale_items (
  id, sale_id, kind, ref_id, description, quantity, unit_price, total
) VALUES
  (current_setting('test.item_a')::uuid, current_setting('test.sale_a')::uuid,
   'service', 's1', 'Corte A', 1, 100, 100),
  (current_setting('test.item_b')::uuid, current_setting('test.sale_b')::uuid,
   'service', 's2', 'Corte B', 1, 200, 200);

INSERT INTO public.sale_payments (id, sale_id, method, amount) VALUES
  (current_setting('test.pay_a')::uuid, current_setting('test.sale_a')::uuid, 'pix', 100),
  (current_setting('test.pay_b')::uuid, current_setting('test.sale_b')::uuid, 'pix', 200);

INSERT INTO public.products (barbershop_id, name) VALUES
  (current_setting('test.shop_a')::uuid, 'Pomada A'),
  (current_setting('test.shop_b')::uuid, 'Pomada B');
INSERT INTO public.suppliers (barbershop_id, name) VALUES
  (current_setting('test.shop_a')::uuid, 'Forn A'),
  (current_setting('test.shop_b')::uuid, 'Forn B');
INSERT INTO public.cash_sessions (barbershop_id) VALUES
  (current_setting('test.shop_a')::uuid),
  (current_setting('test.shop_b')::uuid);
INSERT INTO public.service_packages (barbershop_id, name) VALUES
  (current_setting('test.shop_a')::uuid, 'Pkg A'),
  (current_setting('test.shop_b')::uuid, 'Pkg B');
INSERT INTO public.waitlist (barbershop_id, client_name) VALUES
  (current_setting('test.shop_a')::uuid, 'Cliente A'),
  (current_setting('test.shop_b')::uuid, 'Cliente B');
INSERT INTO public.payables (barbershop_id, amount) VALUES
  (current_setting('test.shop_a')::uuid, 10),
  (current_setting('test.shop_b')::uuid, 20);
INSERT INTO public.campaigns (barbershop_id, name) VALUES
  (current_setting('test.shop_a')::uuid, 'Camp A'),
  (current_setting('test.shop_b')::uuid, 'Camp B');
INSERT INTO public.reviews (barbershop_id, rating) VALUES
  (current_setting('test.shop_a')::uuid, 5),
  (current_setting('test.shop_b')::uuid, 4);
INSERT INTO public.cash_movements (barbershop_id, amount) VALUES
  (current_setting('test.shop_a')::uuid, 5),
  (current_setting('test.shop_b')::uuid, 6);
INSERT INTO public.stock_movements (barbershop_id, quantity) VALUES
  (current_setting('test.shop_a')::uuid, 1),
  (current_setting('test.shop_b')::uuid, 2);
INSERT INTO public.inventory_counts (barbershop_id, counted) VALUES
  (current_setting('test.shop_a')::uuid, 1),
  (current_setting('test.shop_b')::uuid, 2);
INSERT INTO public.receivables (barbershop_id, amount) VALUES
  (current_setting('test.shop_a')::uuid, 1),
  (current_setting('test.shop_b')::uuid, 2);
INSERT INTO public.ops_audit_log (barbershop_id, action) VALUES
  (current_setting('test.shop_a')::uuid, 'a'),
  (current_setting('test.shop_b')::uuid, 'b');
INSERT INTO public.fiscal_documents (barbershop_id, number) VALUES
  (current_setting('test.shop_a')::uuid, 'NFA'),
  (current_setting('test.shop_b')::uuid, 'NFB');

-- Grants tabelas (espelho migration; harness owner = postgres)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- Asserções helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert(cond boolean, msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERT FAIL: %', msg;
  END IF;
  RAISE NOTICE 'PASS: %', msg;
END;
$$;
GRANT EXECUTE ON FUNCTION public._assert(boolean, text) TO authenticated;

-- Confirma ENABLE+FORCE em todas as ops
DO $$
DECLARE
  t TEXT;
  r RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','suppliers','cash_sessions','sales','service_packages','waitlist',
    'payables','campaigns','reviews','cash_movements','stock_movements',
    'inventory_counts','receivables','ops_audit_log','fiscal_documents',
    'sale_items','sale_payments'
  ]
  LOOP
    SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      INTO r
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    PERFORM public._assert(r.rls AND r.force_rls,
      format('ENABLE+FORCE RLS on %s', t));
  END LOOP;
END $$;

-- Schema CREATE revogado
DO $$
DECLARE
  has_create boolean;
BEGIN
  SELECT bool_or(has_schema_privilege(r.rolname, 'public', 'CREATE'))
    INTO has_create
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
  WHERE EXISTS (SELECT 1 FROM pg_roles x WHERE x.rolname = r.rolname);
  PERFORM public._assert(NOT COALESCE(has_create, false),
    'anon/authenticated/service_role sem CREATE on schema public');
END $$;

-- authenticated não executa provision
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.provision_owner_barbershop(
      gen_random_uuid(), 'x', 'x@y.z', 'n', 'slug', '1'
    );
    RESET ROLE;
    RAISE EXCEPTION 'ASSERT FAIL: authenticated deveria sem EXECUTE em provision';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      PERFORM public._assert(true, 'authenticated sem EXECUTE em provision_owner_barbershop');
    WHEN OTHERS THEN
      RESET ROLE;
      -- permission denied for function
      IF SQLERRM ILIKE '%permission%' OR SQLERRM ILIKE '%privilege%' THEN
        PERFORM public._assert(true, 'authenticated sem EXECUTE em provision_owner_barbershop');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- ===========================================================================
-- Contexto usuário A (authenticated + JWT sub)
-- ===========================================================================
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_a'), false);

-- Vê só a própria venda / item / pagamento
SELECT public._assert(
  (SELECT count(*) FROM public.sales) = 1
  AND (SELECT id FROM public.sales) = current_setting('test.sale_a')::uuid,
  'A SELECT sales: só loja A'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_items) = 1
  AND (SELECT id FROM public.sale_items) = current_setting('test.item_a')::uuid,
  'A SELECT sale_items: só item A (não vê B)'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_payments) = 1
  AND (SELECT id FROM public.sale_payments) = current_setting('test.pay_a')::uuid,
  'A SELECT sale_payments: só pagamento A (não vê B)'
);

-- SELECT explícito do item B → 0 linhas
SELECT public._assert(
  (SELECT count(*) FROM public.sale_items WHERE id = current_setting('test.item_b')::uuid) = 0,
  'A SELECT sale_items.id=B → 0'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_payments WHERE id = current_setting('test.pay_b')::uuid) = 0,
  'A SELECT sale_payments.id=B → 0'
);

-- INSERT item na venda B → bloqueado
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sale_items (
      sale_id, kind, ref_id, description, quantity, unit_price, total
    ) VALUES (
      current_setting('test.sale_b')::uuid, 'product', 'x', 'hack', 1, 1, 1
    );
    RAISE EXCEPTION 'ASSERT FAIL: A INSERT sale_items em sale_B deveria falhar';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR not_null_violation THEN
      PERFORM public._assert(true, 'A INSERT sale_items sale_id=B bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'A INSERT sale_items sale_id=B bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- INSERT pagamento na venda B → bloqueado
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sale_payments (sale_id, method, amount)
    VALUES (current_setting('test.sale_b')::uuid, 'cash', 1);
    RAISE EXCEPTION 'ASSERT FAIL: A INSERT sale_payments em sale_B deveria falhar';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM public._assert(true, 'A INSERT sale_payments sale_id=B bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'A INSERT sale_payments sale_id=B bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- UPDATE: tentar reatribuir item A para sale_B → bloqueado
DO $$
BEGIN
  BEGIN
    UPDATE public.sale_items
    SET sale_id = current_setting('test.sale_b')::uuid
    WHERE id = current_setting('test.item_a')::uuid;
    -- Se 0 rows (USING) também é isolamento OK; se atualizou, falhou
    IF FOUND THEN
      RAISE EXCEPTION 'ASSERT FAIL: A UPDATE sale_items → sale_B não deveria afetar linhas';
    END IF;
    PERFORM public._assert(true, 'A UPDATE sale_items→sale_B sem efeito/bloqueado');
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM public._assert(true, 'A UPDATE sale_items→sale_B bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'A UPDATE sale_items→sale_B bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- UPDATE pagamento A → sale_B
DO $$
BEGIN
  BEGIN
    UPDATE public.sale_payments
    SET sale_id = current_setting('test.sale_b')::uuid
    WHERE id = current_setting('test.pay_a')::uuid;
    IF FOUND THEN
      RAISE EXCEPTION 'ASSERT FAIL: A UPDATE sale_payments → sale_B não deveria afetar linhas';
    END IF;
    PERFORM public._assert(true, 'A UPDATE sale_payments→sale_B sem efeito/bloqueado');
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM public._assert(true, 'A UPDATE sale_payments→sale_B bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'A UPDATE sale_payments→sale_B bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- DELETE item B → 0 afetados
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.sale_items WHERE id = current_setting('test.item_b')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._assert(n = 0, 'A DELETE sale_items B → 0 rows');
END $$;

DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.sale_payments WHERE id = current_setting('test.pay_b')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._assert(n = 0, 'A DELETE sale_payments B → 0 rows');
END $$;

-- Ops tables: A vê 1 de cada, não vê B
SELECT public._assert((SELECT count(*) FROM public.products) = 1, 'A products isolado');
SELECT public._assert((SELECT count(*) FROM public.suppliers) = 1, 'A suppliers isolado');
SELECT public._assert((SELECT count(*) FROM public.cash_sessions) = 1, 'A cash_sessions isolado');
SELECT public._assert((SELECT count(*) FROM public.service_packages) = 1, 'A service_packages isolado');
SELECT public._assert((SELECT count(*) FROM public.waitlist) = 1, 'A waitlist isolado');
SELECT public._assert((SELECT count(*) FROM public.payables) = 1, 'A payables isolado');
SELECT public._assert((SELECT count(*) FROM public.campaigns) = 1, 'A campaigns isolado');
SELECT public._assert((SELECT count(*) FROM public.reviews) = 1, 'A reviews isolado');
SELECT public._assert((SELECT count(*) FROM public.cash_movements) = 1, 'A cash_movements isolado');
SELECT public._assert((SELECT count(*) FROM public.stock_movements) = 1, 'A stock_movements isolado');
SELECT public._assert((SELECT count(*) FROM public.inventory_counts) = 1, 'A inventory_counts isolado');
SELECT public._assert((SELECT count(*) FROM public.receivables) = 1, 'A receivables isolado');
SELECT public._assert((SELECT count(*) FROM public.ops_audit_log) = 1, 'A ops_audit_log isolado');
SELECT public._assert((SELECT count(*) FROM public.fiscal_documents) = 1, 'A fiscal_documents isolado');

-- INSERT produto na loja B → bloqueado
DO $$
BEGIN
  BEGIN
    INSERT INTO public.products (barbershop_id, name)
    VALUES (current_setting('test.shop_b')::uuid, 'hack');
    RAISE EXCEPTION 'ASSERT FAIL: A INSERT products loja B deveria falhar';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM public._assert(true, 'A INSERT products loja B bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'A INSERT products loja B bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;

-- ===========================================================================
-- Contexto usuário B — simétrico: não vê/altera A
-- ===========================================================================
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_b'), false);

SELECT public._assert(
  (SELECT count(*) FROM public.sale_items WHERE id = current_setting('test.item_a')::uuid) = 0,
  'B SELECT sale_items A → 0'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_payments WHERE id = current_setting('test.pay_a')::uuid) = 0,
  'B SELECT sale_payments A → 0'
);

DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.sale_items WHERE id = current_setting('test.item_a')::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public._assert(n = 0, 'B DELETE sale_items A → 0');
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.sale_items (
      sale_id, kind, ref_id, description, quantity, unit_price, total
    ) VALUES (
      current_setting('test.sale_a')::uuid, 'product', 'x', 'hack', 1, 1, 1
    );
    RAISE EXCEPTION 'ASSERT FAIL: B INSERT em sale_A deveria falhar';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM public._assert(true, 'B INSERT sale_items sale_id=A bloqueado');
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%row-level%' THEN
        PERFORM public._assert(true, 'B INSERT sale_items sale_id=A bloqueado');
      ELSE
        RAISE;
      END IF;
  END;
END $$;

RESET ROLE;

-- Superuser confirma que dados B ainda existem (DELETE não passou)
SELECT public._assert(
  (SELECT count(*) FROM public.sale_items WHERE id = current_setting('test.item_b')::uuid) = 1,
  'item B intacto após tentativas de A'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_payments WHERE id = current_setting('test.pay_b')::uuid) = 1,
  'pagamento B intacto após tentativas de A'
);
SELECT public._assert(
  (SELECT count(*) FROM public.sale_items WHERE id = current_setting('test.item_a')::uuid) = 1
  AND (SELECT sale_id FROM public.sale_items WHERE id = current_setting('test.item_a')::uuid)
      = current_setting('test.sale_a')::uuid,
  'item A intacto e ainda na sale_A'
);

-- Helpers SECURITY DEFINER ainda funcionam sob authenticated
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_a'), false);
SELECT public._assert(
  public.user_barbershop_id() = current_setting('test.shop_a')::uuid,
  'user_barbershop_id() ok sob authenticated'
);
SELECT public._assert(public.user_role() = 'owner', 'user_role() ok sob authenticated');
RESET ROLE;

SELECT 'FASE1A_RLS_SQL_ISOLATION_PASSED' AS result;
