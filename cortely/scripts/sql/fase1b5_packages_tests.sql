-- Asserts SQL 1.B.5 — sell/consume/revert/cancel, grants, isolamento
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  client_a UUID := 'a0000001-0001-4001-8001-000000000001';
  client_b UUID := 'b0000001-0001-4001-8001-000000000001';
  svc_a UUID := 'a5555555-5555-4555-8555-555555555555';
  svc_b UUID := 'b5555555-5555-4555-8555-555555555555';
  pkg_a UUID := 'a6666666-6666-4666-8666-666666666666';
  sale_ok UUID := 'a1000001-0001-4001-8001-000000000001';
  sale_bad UUID := 'a1000002-0002-4002-8002-000000000002';
  sale_unpaid UUID := 'a1000003-0003-4003-8003-000000000003';
  appt1 UUID := 'a3000001-0001-4001-8001-000000000001';
  appt2 UUID := 'a3000002-0002-4002-8002-000000000002';
  cp_id UUID;
  cons_id UUID;
  rev_id UUID;
  n INT;
  left_n INT;
  st TEXT;
  has_exec BOOLEAN;
  r RECORD;
BEGIN
  INSERT INTO public.barbershops (id, name, slug) VALUES
    (shop_a, 'Shop A', 'shop-a'),
    (shop_b, 'Shop B', 'shop-b'),
    (shop_c, 'Shop C', 'shop-c');
  INSERT INTO public.profiles (id, barbershop_id, full_name, email, role) VALUES
    (user_a, shop_a, 'Owner A', 'a@test', 'owner');
  INSERT INTO public.clients (id, barbershop_id, full_name, phone) VALUES
    (client_a, shop_a, 'Cliente A', '111'),
    (client_b, shop_b, 'Cliente B', '222');
  INSERT INTO public.services (id, barbershop_id, name, price) VALUES
    (svc_a, shop_a, 'Corte', 50),
    (svc_b, shop_b, 'Corte B', 50);
  INSERT INTO public.appointments (id, barbershop_id, client_name) VALUES
    (appt1, shop_a, 'A1'),
    (appt2, shop_a, 'A2');

  -- UNIQUE compostos
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing clients_id_barbershop_uidx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing service_packages_id_barbershop_uidx';
  END IF;
  RAISE NOTICE 'PASS: UNIQUE compostos clients/packages';

  INSERT INTO public.service_packages (
    id, barbershop_id, name, price, credits, valid_days, is_active
  ) VALUES (pkg_a, shop_a, 'Pack 3', 150, 3, 90, TRUE);
  INSERT INTO public.service_package_services (package_id, service_id, barbershop_id)
  VALUES (pkg_a, svc_a, shop_a);

  -- Isolamento: serviço de outro tenant
  BEGIN
    INSERT INTO public.service_package_services (package_id, service_id, barbershop_id)
    VALUES (pkg_a, svc_b, shop_a);
    RAISE EXCEPTION 'FAIL: service cross-tenant permitido';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK composta bloqueia service de outro tenant';
  END;

  -- Isolamento: cliente de outro tenant no client_package
  INSERT INTO public.sales (id, barbershop_id, client_id, total, status)
  VALUES (sale_ok, shop_a, client_a, 150, 'paid');
  INSERT INTO public.sale_items (
    sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES (sale_ok, shop_a, 'package', pkg_a::text, 'Pack 3', 1, 150, 150);

  BEGIN
    INSERT INTO public.client_packages (
      barbershop_id, client_id, package_id, sale_id,
      credits_total, credits_used, expires_at, status
    ) VALUES (
      shop_a, client_b, pkg_a, sale_ok, 3, 0, now() + interval '30 days', 'active'
    );
    RAISE EXCEPTION 'FAIL: client cross-tenant permitido';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK composta bloqueia client de outro tenant';
  END;

  -- Venda sem item package → rejeitada
  INSERT INTO public.sales (id, barbershop_id, total, status)
  VALUES (sale_bad, shop_a, 10, 'paid');
  INSERT INTO public.sale_items (
    sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES (sale_bad, shop_a, 'service', svc_a::text, 'Corte', 1, 10, 10);
  BEGIN
    PERFORM public.ops_sell_package(shop_a, client_a, pkg_a, sale_bad, 'owner');
    RAISE EXCEPTION 'FAIL: sell sem item package permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%SALE_MISSING_PACKAGE%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: venda sem item package rejeitada';
    ELSE RAISE; END IF;
  END;

  -- Venda não paga
  INSERT INTO public.sales (id, barbershop_id, total, status)
  VALUES (sale_unpaid, shop_a, 150, 'canceled');
  BEGIN
    PERFORM public.ops_sell_package(shop_a, client_a, pkg_a, sale_unpaid, 'owner');
    RAISE EXCEPTION 'FAIL: sell unpaid permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%SALE_NOT_PAID%' OR SQLERRM LIKE '%SALE_MISSING%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: venda não paga rejeitada';
    ELSE RAISE; END IF;
  END;

  -- Sell OK
  SELECT * INTO r FROM public.ops_sell_package(shop_a, client_a, pkg_a, sale_ok, 'owner');
  cp_id := r.client_package_id;
  IF r.credits_total <> 3 OR r.status <> 'active' THEN
    RAISE EXCEPTION 'FAIL: sell result';
  END IF;
  RAISE NOTICE 'PASS: ops_sell_package';

  -- Idempotente
  SELECT * INTO r FROM public.ops_sell_package(shop_a, client_a, pkg_a, sale_ok, 'owner');
  IF r.client_package_id <> cp_id THEN
    RAISE EXCEPTION 'FAIL: sell não idempotente';
  END IF;
  RAISE NOTICE 'PASS: sell idempotente por sale_id';

  -- Consumir até esgotar
  SELECT * INTO r FROM public.ops_consume_package_credit(shop_a, cp_id, appt1, 'owner');
  cons_id := r.consumption_id;
  IF r.credits_left <> 2 THEN RAISE EXCEPTION 'FAIL: left=%', r.credits_left; END IF;

  -- Mesmo agendamento 2x → idempotente
  SELECT * INTO r FROM public.ops_consume_package_credit(shop_a, cp_id, appt1, 'owner');
  IF r.consumption_id <> cons_id OR r.credits_left <> 2 THEN
    RAISE EXCEPTION 'FAIL: consume mesmo appt não idempotente';
  END IF;
  RAISE NOTICE 'PASS: mesmo appointment 2x → um consumo';

  PERFORM public.ops_consume_package_credit(shop_a, cp_id, appt2, 'owner');
  SELECT * INTO r FROM public.ops_consume_package_credit(shop_a, cp_id, NULL, 'owner');
  IF r.credits_left <> 0 OR r.status <> 'depleted' THEN
    RAISE EXCEPTION 'FAIL: deplete left=% status=%', r.credits_left, r.status;
  END IF;
  RAISE NOTICE 'PASS: consumir até esgotar';

  -- Sem saldo
  BEGIN
    PERFORM public.ops_consume_package_credit(shop_a, cp_id, NULL, 'owner');
    RAISE EXCEPTION 'FAIL: consume sem saldo permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%NO_CREDITS%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: sem saldo → 409';
    ELSE RAISE; END IF;
  END;

  -- Reverter um consumo → devolve crédito
  SELECT * INTO r FROM public.ops_revert_package_consumption(shop_a, cons_id, 'owner');
  rev_id := r.reversal_id;
  IF r.credits_left <> 1 OR r.status <> 'active' THEN
    RAISE EXCEPTION 'FAIL: revert left=% status=%', r.credits_left, r.status;
  END IF;

  -- Reverter 2x → idempotente
  SELECT * INTO r FROM public.ops_revert_package_consumption(shop_a, cons_id, 'owner');
  IF r.reversal_id <> rev_id OR r.credits_left <> 1 THEN
    RAISE EXCEPTION 'FAIL: revert 2x não idempotente';
  END IF;
  RAISE NOTICE 'PASS: revert consumo (idempotente)';

  -- Append-only consumptions
  BEGIN
    DELETE FROM public.client_package_consumptions WHERE id = cons_id;
    RAISE EXCEPTION 'FAIL: DELETE consumption permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'PASS: DELETE consumption negado';
    ELSE RAISE; END IF;
  END;

  -- Expirado: novo pacote com expires no passado via UPDATE forçado após sell
  -- (criar pack 1 crédito, sale, sell, backdate expires)
  DECLARE
    pkg_exp UUID := 'a6666666-6666-4666-8666-6666666666e1';
    sale_exp UUID := 'a1000004-0004-4004-8004-000000000004';
    cp_exp UUID;
  BEGIN
    INSERT INTO public.service_packages (
      id, barbershop_id, name, price, credits, valid_days, is_active
    ) VALUES (pkg_exp, shop_a, 'Exp', 10, 1, 90, TRUE);
    INSERT INTO public.sales (id, barbershop_id, total, status)
    VALUES (sale_exp, shop_a, 10, 'paid');
    INSERT INTO public.sale_items (
      sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
    ) VALUES (sale_exp, shop_a, 'package', pkg_exp::text, 'Exp', 1, 10, 10);
    SELECT client_package_id INTO cp_exp
    FROM public.ops_sell_package(shop_a, client_a, pkg_exp, sale_exp, 'owner');
    UPDATE public.client_packages
    SET expires_at = now() - interval '1 day'
    WHERE id = cp_exp;
    SELECT * INTO r FROM public.ops_consume_package_credit(shop_a, cp_exp, NULL, 'owner');
    IF r.consumption_id IS NOT NULL OR r.status <> 'expired' THEN
      RAISE EXCEPTION 'FAIL: expired deveria retornar consumption_id NULL status=expired got % / %',
        r.consumption_id, r.status;
    END IF;
    SELECT status INTO st FROM public.client_packages WHERE id = cp_exp;
    IF st <> 'expired' THEN
      RAISE EXCEPTION 'FAIL: status após expired=%', st;
    END IF;
    SELECT count(*) INTO n FROM public.client_package_consumptions
    WHERE client_package_id = cp_exp AND reversal_of IS NULL;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: expired consumiu'; END IF;
    RAISE NOTICE 'PASS: expirado não consome e fica expired';
  END;

  -- Cancel sem consumos ativos
  DECLARE
    pkg_c UUID := 'a6666666-6666-4666-8666-6666666666c1';
    sale_c UUID := 'a1000005-0005-4005-8005-000000000005';
    cp_c UUID;
  BEGIN
    INSERT INTO public.service_packages (
      id, barbershop_id, name, price, credits, valid_days, is_active
    ) VALUES (pkg_c, shop_a, 'Can', 20, 2, 90, TRUE);
    INSERT INTO public.sales (id, barbershop_id, total, status)
    VALUES (sale_c, shop_a, 20, 'paid');
    INSERT INTO public.sale_items (
      sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
    ) VALUES (sale_c, shop_a, 'package', pkg_c::text, 'Can', 1, 20, 20);
    SELECT client_package_id INTO cp_c
    FROM public.ops_sell_package(shop_a, client_a, pkg_c, sale_c, 'owner');
    SELECT status INTO st FROM public.ops_cancel_client_package(shop_a, cp_c, 'owner');
    IF st <> 'canceled' THEN RAISE EXCEPTION 'FAIL: cancel status=%', st; END IF;
    RAISE NOTICE 'PASS: cancel sem consumos ativos';
  END;

  -- Grants
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'ops_sell_package'
      AND grantee IN ('anon', 'authenticated') AND privilege_type = 'EXECUTE'
  ) INTO has_exec;
  IF has_exec THEN RAISE EXCEPTION 'FAIL: anon/auth EXECUTE'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'ops_sell_package'
      AND grantee = 'service_role' AND privilege_type = 'EXECUTE'
  ) INTO has_exec;
  IF NOT has_exec THEN RAISE EXCEPTION 'FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'PASS: EXECUTE só service_role';

  RAISE NOTICE 'FASE1B5_PACKAGES_SQL_PASSED';
END $$;
