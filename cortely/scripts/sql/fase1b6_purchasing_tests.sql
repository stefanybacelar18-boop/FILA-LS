-- Asserts SQL 1.B.6 — PO create/receive/cancel + payables + grants
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  sup_a UUID := 'a1111111-1111-4111-8111-111111111111';
  sup_b UUID := 'b2222222-2222-4222-8222-222222222222';
  prod_a UUID := 'a3333333-3333-4333-8333-333333333333';
  prod_b UUID := 'b4444444-4444-4444-8444-444444444444';
  po_id UUID;
  pay_id UUID;
  n INT;
  stock INT;
  has_exec BOOLEAN;
  r RECORD;
  items JSONB;
BEGIN
  INSERT INTO public.barbershops (id, name, slug) VALUES
    (shop_a, 'Shop A', 'shop-a'),
    (shop_b, 'Shop B', 'shop-b'),
    (shop_c, 'Shop C', 'shop-c');
  INSERT INTO public.profiles (id, barbershop_id, full_name, email, role) VALUES
    (user_a, shop_a, 'Owner A', 'a@test', 'owner');
  INSERT INTO public.suppliers (id, barbershop_id, name) VALUES
    (sup_a, shop_a, 'Sup A'),
    (sup_b, shop_b, 'Sup B');
  INSERT INTO public.products (id, barbershop_id, name, price, cost, stock_qty) VALUES
    (prod_a, shop_a, 'Prod A', 10, 5, 0),
    (prod_b, shop_b, 'Prod B', 10, 5, 0);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_supplier_tenant_fkey') THEN
    RAISE EXCEPTION 'FAIL: missing PO supplier FK';
  END IF;
  RAISE NOTICE 'PASS: schema purchasing/payables';

  -- Cross-tenant supplier
  BEGIN
    INSERT INTO public.purchase_orders (
      barbershop_id, supplier_id, status, total_cost, created_by
    ) VALUES (shop_a, sup_b, 'ordered', 10, 'x');
    RAISE EXCEPTION 'FAIL: supplier cross-tenant';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK bloqueia supplier de outro tenant';
  END;

  items := jsonb_build_array(
    jsonb_build_object('product_id', prod_a, 'quantity', 2, 'unit_cost', 10.555),
    jsonb_build_object('product_id', prod_a, 'quantity', 1, 'unit_cost', 3)
  );
  -- round(2*10.555,2)=21.11; +3 = 24.11
  SELECT * INTO r FROM public.ops_create_purchase_order(
    shop_a, sup_a, items, 'n1', 'owner'
  );
  po_id := r.purchase_order_id;
  IF r.total_cost <> 24.11 OR r.status <> 'ordered' THEN
    RAISE EXCEPTION 'FAIL: create total=% status=%', r.total_cost, r.status;
  END IF;
  RAISE NOTICE 'PASS: create PO com arredondamento por item';

  -- Produto outro tenant
  BEGIN
    PERFORM public.ops_create_purchase_order(
      shop_a, sup_a,
      jsonb_build_array(jsonb_build_object('product_id', prod_b, 'quantity', 1, 'unit_cost', 1)),
      NULL, 'owner'
    );
    RAISE EXCEPTION 'FAIL: product cross-tenant';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PRODUCT_NOT_FOUND%' OR SQLSTATE = 'PT404' THEN
      RAISE NOTICE 'PASS: produto outro tenant barrado';
    ELSE RAISE; END IF;
  END;

  -- Receive
  SELECT * INTO r FROM public.ops_receive_purchase_order(shop_a, po_id, 'owner');
  pay_id := r.payable_id;
  IF r.status <> 'received' OR pay_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: receive';
  END IF;
  SELECT stock_qty INTO stock FROM public.products WHERE id = prod_a;
  IF stock <> 3 THEN RAISE EXCEPTION 'FAIL: stock=% want 3', stock; END IF;
  SELECT amount INTO stock FROM public.payables WHERE id = pay_id; -- reuse numeric slot via cast
  -- amount is numeric; compare via separate select
  IF (SELECT amount FROM public.payables WHERE id = pay_id) <> 24.11 THEN
    RAISE EXCEPTION 'FAIL: payable amount';
  END IF;
  RAISE NOTICE 'PASS: receive — estoque + payable vinculado';

  -- Receive 2x
  BEGIN
    PERFORM public.ops_receive_purchase_order(shop_a, po_id, 'owner');
    RAISE EXCEPTION 'FAIL: receive 2x';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ALREADY_RECEIVED%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: receive 2x → 409';
    ELSE RAISE; END IF;
  END;

  -- Cancel received
  BEGIN
    PERFORM public.ops_cancel_purchase_order(shop_a, po_id, 'owner');
    RAISE EXCEPTION 'FAIL: cancel received';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ALREADY_RECEIVED%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: cancel received → 409';
    ELSE RAISE; END IF;
  END;

  -- Cancel payable de OC
  BEGIN
    PERFORM public.ops_cancel_payable(shop_a, pay_id, 'owner');
    RAISE EXCEPTION 'FAIL: cancel payable PO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FROM_PO%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: cancel payable de OC → 409';
    ELSE RAISE; END IF;
  END;

  -- Conta de OC: amount imutável via upsert; description/due_date ok
  BEGIN
    PERFORM public.ops_upsert_payable(
      shop_a, pay_id, 'Ordem de compra editada', 99.99, CURRENT_DATE, 'Compra', 'owner'
    );
    RAISE EXCEPTION 'FAIL: upsert amount de payable PO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FROM_PO%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: upsert amount de payable PO → 409';
    ELSE RAISE; END IF;
  END;
  PERFORM public.ops_upsert_payable(
    shop_a, pay_id, 'Ordem de compra editada', 24.11, CURRENT_DATE + 7, 'Compra', 'owner'
  );
  IF (SELECT description FROM public.payables WHERE id = pay_id) <> 'Ordem de compra editada' THEN
    RAISE EXCEPTION 'FAIL: upsert description de payable PO';
  END IF;
  RAISE NOTICE 'PASS: upsert description/due_date de payable PO ok; amount barrado';

  -- Trigger: barbershop_id / purchase_order_id imutáveis em conta open
  BEGIN
    UPDATE public.payables SET barbershop_id = shop_b WHERE id = pay_id;
    RAISE EXCEPTION 'FAIL: mudar barbershop_id de open';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%imutáv%' OR SQLERRM LIKE '%payables%' THEN
      RAISE NOTICE 'PASS: UPDATE barbershop_id de open → bloqueado';
    ELSE RAISE; END IF;
  END;
  BEGIN
    UPDATE public.payables SET purchase_order_id = NULL WHERE id = pay_id;
    RAISE EXCEPTION 'FAIL: limpar purchase_order_id de open';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%imutáv%' OR SQLERRM LIKE '%payables%' THEN
      RAISE NOTICE 'PASS: UPDATE purchase_order_id de open → bloqueado';
    ELSE RAISE; END IF;
  END;

  -- Pay payable
  PERFORM public.ops_pay_payable(shop_a, pay_id, 'owner');
  BEGIN
    PERFORM public.ops_pay_payable(shop_a, pay_id, 'owner');
    RAISE EXCEPTION 'FAIL: pay 2x';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ALREADY_PAID%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: pay payable 2x → 409';
    ELSE RAISE; END IF;
  END;

  -- Edit paid negado
  BEGIN
    UPDATE public.payables SET amount = 1 WHERE id = pay_id;
    RAISE EXCEPTION 'FAIL: edit paid';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%payables%' THEN
      RAISE NOTICE 'PASS: editar conta paga negado';
    ELSE RAISE; END IF;
  END;

  -- Upsert + pay manual
  SELECT * INTO r FROM public.ops_upsert_payable(
    shop_a, NULL, 'Aluguel', 500, CURRENT_DATE, 'Fixo', 'owner'
  );
  pay_id := r.payable_id;
  PERFORM public.ops_pay_payable(shop_a, pay_id, 'owner');
  RAISE NOTICE 'PASS: upsert/pay payable manual';

  -- Cancel ordered PO
  SELECT purchase_order_id INTO po_id FROM public.ops_create_purchase_order(
    shop_a, sup_a,
    jsonb_build_array(jsonb_build_object('product_id', prod_a, 'quantity', 1, 'unit_cost', 2)),
    NULL, 'owner'
  );
  PERFORM public.ops_cancel_purchase_order(shop_a, po_id, 'owner');
  RAISE NOTICE 'PASS: cancel ordered PO';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema='public' AND routine_name='ops_receive_purchase_order'
      AND grantee IN ('anon','authenticated') AND privilege_type='EXECUTE'
  ) INTO has_exec;
  IF has_exec THEN RAISE EXCEPTION 'FAIL: EXECUTE anon/auth'; END IF;
  RAISE NOTICE 'PASS: EXECUTE só service_role';

  RAISE NOTICE 'FASE1B6_PURCHASING_SQL_PASSED';
END $$;
