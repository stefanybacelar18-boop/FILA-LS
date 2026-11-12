-- Asserts SQL 1.B.1 — CHECKs, FKs compostas RESTRICT, append-only, 3 tenants
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  user_b UUID := '22222222-2222-4222-8222-2222222222b2';
  user_c UUID := '33333333-3333-4333-8333-3333333333c3';
  sup_a UUID := '55555555-5555-4555-8555-5555555555a1';
  sup_b UUID := '55555555-5555-4555-8555-5555555555b2';
  prod_a UUID := '66666666-6666-4666-8666-6666666666a1';
  prod_b UUID := '66666666-6666-4666-8666-6666666666b2';
  prod_c UUID := '66666666-6666-4666-8666-6666666666c3';
  n INT;
  ok BOOLEAN;
  v_stock INT;
BEGIN
  INSERT INTO public.barbershops (id, name, slug) VALUES
    (shop_a, 'Shop A', 'shop-a'),
    (shop_b, 'Shop B', 'shop-b'),
    (shop_c, 'Shop C', 'shop-c');
  INSERT INTO public.profiles (id, barbershop_id, full_name, email, role) VALUES
    (user_a, shop_a, 'Owner A', 'a@test', 'owner'),
    (user_b, shop_b, 'Owner B', 'b@test', 'owner'),
    (user_c, shop_c, 'Owner C', 'c@test', 'owner');
  INSERT INTO public.suppliers (id, barbershop_id, name) VALUES
    (sup_a, shop_a, 'Sup A'),
    (sup_b, shop_b, 'Sup B');
  INSERT INTO public.products (
    id, barbershop_id, name, price, cost, stock_qty, min_stock, supplier_id
  ) VALUES
    (prod_a, shop_a, 'Prod A', 10, 4, 5, 2, sup_a),
    (prod_b, shop_b, 'Prod B', 20, 8, 5, 2, sup_b),
    (prod_c, shop_c, 'Prod C', 15, 5, 5, 2, NULL);

  -- UNIQUE (id, barbershop_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_id_barbershop_uidx'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing products_id_barbershop_uidx';
  END IF;
  RAISE NOTICE 'PASS: UNIQUE (id, barbershop_id) products';

  -- CHECK stock_qty / price / cost
  BEGIN
    UPDATE public.products SET stock_qty = -1 WHERE id = prod_a;
    RAISE EXCEPTION 'FAIL: allowed negative stock_qty';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK stock_qty >= 0';
  END;
  BEGIN
    UPDATE public.products SET price = -1 WHERE id = prod_a;
    RAISE EXCEPTION 'FAIL: allowed negative price';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK price >= 0';
  END;

  -- difference CHECK
  BEGIN
    INSERT INTO public.inventory_counts (
      barbershop_id, product_id, system_qty, counted_qty, difference, counted_by
    ) VALUES (shop_a, prod_a, 5, 3, 0, 'x');
    RAISE EXCEPTION 'FAIL: allowed bad difference';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK difference = counted - system';
  END;

  -- FK composta: movimento cross-tenant barrado
  BEGIN
    INSERT INTO public.stock_movements (barbershop_id, product_id, delta, reason)
    VALUES (shop_b, prod_a, 1, 'cross');
    RAISE EXCEPTION 'FAIL: cross-tenant stock_movement allowed';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK composta barra movimento cross-tenant';
  END;

  -- DELETE produto com histórico → RESTRICT
  PERFORM public.ops_adjust_stock(shop_a, prod_a, 1, 'seed hist');
  BEGIN
    DELETE FROM public.products WHERE id = prod_a;
    RAISE EXCEPTION 'FAIL: deleted product with history';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: DELETE produto com histórico bloqueado (RESTRICT)';
  END;

  -- soft-deactivate ok
  UPDATE public.products SET is_active = false WHERE id = prod_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: deactivate'; END IF;
  UPDATE public.products SET is_active = true WHERE id = prod_a;
  RAISE NOTICE 'PASS: is_active=false permitido';

  -- ops_adjust_stock insuficiente → PT409
  BEGIN
    PERFORM public.ops_adjust_stock(shop_a, prod_a, -9999, 'drain');
    RAISE EXCEPTION 'FAIL: insufficient stock allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: ops_adjust_stock insuficiente';
    ELSE
      RAISE;
    END IF;
  END;

  -- produto inexistente no tenant → PT404
  BEGIN
    PERFORM public.ops_adjust_stock(shop_a, prod_b, 1, 'x');
    RAISE EXCEPTION 'FAIL: cross adjust allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PRODUCT_NOT_FOUND%' OR SQLSTATE = 'PT404' THEN
      RAISE NOTICE 'PASS: adjust cross-tenant → PRODUCT_NOT_FOUND';
    ELSE
      RAISE;
    END IF;
  END;

  -- inventário + ajuste mesma TX
  SELECT stock_qty INTO v_stock FROM public.products WHERE id = prod_c;
  PERFORM public.ops_register_inventory_count(shop_c, prod_c, v_stock + 2, 'counter');
  SELECT stock_qty INTO n FROM public.products WHERE id = prod_c;
  IF n <> v_stock + 2 THEN
    RAISE EXCEPTION 'FAIL: inventory did not adjust stock (% vs %)', n, v_stock + 2;
  END IF;
  RAISE NOTICE 'PASS: inventário ajusta estoque na mesma TX';

  -- append-only grants stock_movements
  ok := has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.stock_movements', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated ainda tem UPDATE/DELETE em stock_movements';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.stock_movements', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: authenticated sem INSERT em stock_movements';
  END IF;
  RAISE NOTICE 'PASS: stock_movements append-only (sem UPDATE/DELETE)';

  -- anon sem EXECUTE nas funções
  IF has_function_privilege('anon', 'public.ops_adjust_stock(uuid,uuid,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon tem EXECUTE em ops_adjust_stock';
  END IF;
  RAISE NOTICE 'PASS: anon sem EXECUTE em ops_adjust_stock';

  -- Isolamento 3 tenants via RLS (authenticated)
  -- (detalhe exercitado também no runner TS; aqui sanity)
  RAISE NOTICE 'FASE1B1_PRODUCTS_STOCK_SQL_PASSED';
END $$;
