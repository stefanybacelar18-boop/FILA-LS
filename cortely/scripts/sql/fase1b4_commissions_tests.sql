-- Asserts SQL 1.B.4 — regras, accrual, reverse, clawback, pay/P24, grants, isolamento
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  user_b UUID := '22222222-2222-4222-8222-2222222222b2';
  user_c UUID := '33333333-3333-4333-8333-3333333333c3';
  barber_a UUID := 'a1111111-1111-4111-8111-111111111111';
  barber_b UUID := 'b2222222-2222-4222-8222-222222222222';
  barber_c UUID := 'c3333333-3333-4333-8333-333333333333';
  svc_a UUID := 'a5555555-5555-4555-8555-555555555555';
  sale1 UUID := 'a1000001-0001-4001-8001-000000000001';
  sale2 UUID := 'a1000002-0002-4002-8002-000000000002';
  sale3 UUID := 'a1000003-0003-4003-8003-000000000003';
  item1 UUID := 'a2000001-0001-4001-8001-000000000001';
  item2 UUID := 'a2000002-0002-4002-8002-000000000002';
  item3 UUID := 'a2000003-0003-4003-8003-000000000003';
  item4 UUID := 'a2000004-0004-4004-8004-000000000004';
  entry_paid UUID;
  claw_id UUID;
  pay RECORD;
  n INT;
  adv_amt NUMERIC;
  adv_status TEXT;
  has_exec BOOLEAN;
BEGIN
  INSERT INTO public.barbershops (id, name, slug) VALUES
    (shop_a, 'Shop A', 'shop-a'),
    (shop_b, 'Shop B', 'shop-b'),
    (shop_c, 'Shop C', 'shop-c');
  INSERT INTO public.profiles (id, barbershop_id, full_name, email, role) VALUES
    (user_a, shop_a, 'Owner A', 'a@test', 'owner'),
    (user_b, shop_b, 'Owner B', 'b@test', 'owner'),
    (user_c, shop_c, 'Owner C', 'c@test', 'owner');

  INSERT INTO public.barbers (id, barbershop_id, name) VALUES
    (barber_a, shop_a, 'Barber A'),
    (barber_b, shop_b, 'Barber B'),
    (barber_c, shop_c, 'Barber C');
  INSERT INTO public.services (id, barbershop_id, name, price) VALUES
    (svc_a, shop_a, 'Corte', 50);

  -- P12 UNIQUE
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'barbers_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing barbers_id_barbershop_uidx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing services_id_barbershop_uidx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing sale_items_id_barbershop_uidx';
  END IF;
  RAISE NOTICE 'PASS: P12 UNIQUE (id, barbershop_id) barbers/services/sale_items';

  -- Regra padrão shop A: 40% serviço, 10% produto
  INSERT INTO public.commission_rules (
    barbershop_id, barber_id, service_id, service_percent, product_percent
  ) VALUES (shop_a, NULL, NULL, 40, 10);

  -- Venda 1: serviço 100 + produto 50
  INSERT INTO public.sales (id, barbershop_id, barber_id, subtotal, total, status)
  VALUES (sale1, shop_a, barber_a, 150, 150, 'paid');
  INSERT INTO public.sale_items (
    id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES
    (item1, sale1, shop_a, 'service', svc_a::text, 'Corte', 1, 100, 100),
    (item2, sale1, shop_a, 'product', 'prod-1', 'Pomada', 1, 50, 50);

  -- Accrual
  SELECT count(*) INTO n FROM public.ops_accrue_commission(shop_a, sale1);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: accrual esperava 2 entries, got %', n; END IF;
  -- 40% de 100 = 40; 10% de 50 = 5; total 45
  SELECT coalesce(sum(amount),0) INTO adv_amt
  FROM public.commission_entries
  WHERE barbershop_id = shop_a AND sale_id = sale1 AND status = 'pending';
  IF adv_amt <> 45 THEN RAISE EXCEPTION 'FAIL: accrual total=% want 45', adv_amt; END IF;
  RAISE NOTICE 'PASS: accrual serviço+produto (40+5=45)';

  -- Idempotente
  SELECT count(*) INTO n FROM public.ops_accrue_commission(shop_a, sale1);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: accrual 2x duplicou'; END IF;
  SELECT count(*) INTO n FROM public.commission_entries
  WHERE barbershop_id = shop_a AND sale_id = sale1 AND status = 'pending';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: accrual 2x alterou count'; END IF;
  RAISE NOTICE 'PASS: accrual 2x sem duplicata';

  -- Isolamento FK: regra com barbeiro de outro tenant
  BEGIN
    INSERT INTO public.commission_rules (
      barbershop_id, barber_id, service_percent, product_percent
    ) VALUES (shop_a, barber_b, 50, 10);
    RAISE EXCEPTION 'FAIL: FK composta barber cross-tenant permitida';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK composta bloqueia barbeiro de outro tenant';
  END;

  -- Isolamento: item de outro tenant
  INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
  VALUES (sale2, shop_b, barber_b, 80, 'paid');
  INSERT INTO public.sale_items (
    id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES (item3, sale2, shop_b, 'service', 'x', 'Corte B', 1, 80, 80);

  BEGIN
    INSERT INTO public.commission_entries (
      barbershop_id, barber_id, sale_id, sale_item_id, kind,
      amount, basis, percent, status
    ) VALUES (shop_a, barber_a, sale1, item3, 'service', 10, 80, 12.5, 'pending');
    RAISE EXCEPTION 'FAIL: sale_item cross-tenant permitido';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: FK composta bloqueia sale_item de outro tenant';
  END;

  -- Reverse pending (P15)
  SELECT count(*) INTO n FROM public.ops_reverse_pending_commissions(shop_a, sale1);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: reverse count=%', n; END IF;
  SELECT count(*) INTO n FROM public.commission_entries
  WHERE barbershop_id = shop_a AND sale_id = sale1 AND status = 'reversed';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: reversed rows=%', n; END IF;
  -- Idempotente reverse
  SELECT count(*) INTO n FROM public.ops_reverse_pending_commissions(shop_a, sale1);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: reverse 2x não idempotente'; END IF;
  RAISE NOTICE 'PASS: reverse pending → reversed (idempotente)';

  -- Payout ignora pending com reversão
  SELECT * INTO pay FROM public.ops_pay_commissions(shop_a, barber_a, 'owner-a');
  IF pay.count <> 0 OR pay.gross <> 0 THEN
    RAISE EXCEPTION 'FAIL: payout pagou entries revertidas count=% gross=%', pay.count, pay.gross;
  END IF;
  RAISE NOTICE 'PASS: payout ignora pending com reversão';

  -- Nova venda para pay / clawback / P24
  INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
  VALUES (sale3, shop_a, barber_a, 250, 'paid');
  INSERT INTO public.sale_items (
    id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES (item4, sale3, shop_a, 'service', svc_a::text, 'Combo', 1, 250, 250);
  PERFORM public.ops_accrue_commission(shop_a, sale3);
  -- 40% de 250 = 100
  SELECT coalesce(sum(amount),0) INTO adv_amt
  FROM public.commission_entries
  WHERE barbershop_id = shop_a AND sale_id = sale3 AND status = 'pending';
  IF adv_amt <> 100 THEN RAISE EXCEPTION 'FAIL: sale3 accrual=% want 100', adv_amt; END IF;

  -- Vale R$300 > comissão R$100 (P24)
  INSERT INTO public.staff_advances (
    barbershop_id, barber_id, amount, reason, status
  ) VALUES (shop_a, barber_a, 300, 'vale teste', 'open');

  SELECT * INTO pay FROM public.ops_pay_commissions(shop_a, barber_a, 'owner-a');
  IF pay.count <> 1 OR pay.gross <> 100 OR pay.advances_deducted <> 100 OR pay.net <> 0 THEN
    RAISE EXCEPTION 'FAIL: P24 pay gross=% ded=% net=% count=%',
      pay.gross, pay.advances_deducted, pay.net, pay.count;
  END IF;
  SELECT amount - deducted_amount, status INTO adv_amt, adv_status
  FROM public.staff_advances
  WHERE barbershop_id = shop_a AND barber_id = barber_a;
  IF adv_amt <> 200 OR adv_status <> 'partially_deducted' THEN
    RAISE EXCEPTION 'FAIL: P24 saldo vale=% status=% want 200/partially_deducted',
      adv_amt, adv_status;
  END IF;
  RAISE NOTICE 'PASS: P24 vale 300 − comissão 100 → net 0, saldo 200';

  SELECT id INTO entry_paid
  FROM public.commission_entries
  WHERE barbershop_id = shop_a AND sale_id = sale3 AND status = 'paid'
  LIMIT 1;
  IF entry_paid IS NULL THEN RAISE EXCEPTION 'FAIL: entry não paid'; END IF;

  -- Clawback
  SELECT clawback_id INTO claw_id
  FROM public.ops_clawback_commission(shop_a, entry_paid, 'owner-a');
  IF claw_id IS NULL THEN RAISE EXCEPTION 'FAIL: clawback null'; END IF;
  RAISE NOTICE 'PASS: clawback de entry paid';

  -- Clawback duplicado → bloqueado
  BEGIN
    PERFORM public.ops_clawback_commission(shop_a, entry_paid, 'owner-a');
    RAISE EXCEPTION 'FAIL: clawback duplicado permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%CLAWBACK_ALREADY%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: clawback duplicado → bloqueado';
    ELSE
      RAISE;
    END IF;
  END;

  -- Append-only UPDATE/DELETE
  BEGIN
    UPDATE public.commission_entries SET amount = 1 WHERE id = entry_paid;
    RAISE EXCEPTION 'FAIL: UPDATE amount permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'PASS: UPDATE direto em entries negado';
    ELSE
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM public.commission_entries WHERE id = entry_paid;
    RAISE EXCEPTION 'FAIL: DELETE permitido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN
      RAISE NOTICE 'PASS: DELETE direto em entries negado';
    ELSE
      RAISE;
    END IF;
  END;

  -- Grants: anon/authenticated sem EXECUTE
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'ops_accrue_commission'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'EXECUTE'
  ) INTO has_exec;
  IF has_exec THEN
    RAISE EXCEPTION 'FAIL: anon/authenticated têm EXECUTE em ops_accrue';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'ops_pay_commissions'
      AND grantee = 'service_role'
      AND privilege_type = 'EXECUTE'
  ) INTO has_exec;
  IF NOT has_exec THEN
    RAISE EXCEPTION 'FAIL: service_role sem EXECUTE em ops_pay';
  END IF;
  RAISE NOTICE 'PASS: EXECUTE só service_role; anon/authenticated sem EXECUTE';

  -- authenticated sem INSERT
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.commission_rules (
      barbershop_id, barber_id, service_percent, product_percent
    ) VALUES (shop_a, NULL, 10, 10);
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: authenticated INSERT em rules permitido';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RESET ROLE;
    IF SQLERRM LIKE '%FAIL: authenticated%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: authenticated sem escrita em commission_rules';
  END;

  -- Ranking exclui clawback
  INSERT INTO public.sales (id, barbershop_id, barber_id, total, status)
  VALUES ('a1000004-0004-4004-8004-000000000004', shop_a, barber_a, 100, 'paid');
  INSERT INTO public.sale_items (
    id, sale_id, barbershop_id, kind, ref_id, description, quantity, unit_price, total
  ) VALUES (
    'a2000005-0005-4005-8005-000000000005',
    'a1000004-0004-4004-8004-000000000004',
    shop_a, 'service', 'rk', 'Rank', 1, 100, 100
  );
  PERFORM public.ops_accrue_commission(shop_a, 'a1000004-0004-4004-8004-000000000004');
  PERFORM public.ops_pay_commissions(shop_a, barber_a, 'rank-test');
  SELECT id INTO entry_paid FROM public.commission_entries
  WHERE barbershop_id = shop_a
    AND sale_id = 'a1000004-0004-4004-8004-000000000004'
    AND status = 'paid';
  SELECT coalesce(sum(commission), 0) INTO adv_amt
  FROM public.ops_barber_ranking(shop_a, to_char(now(), 'YYYY-MM'))
  WHERE barber_id = barber_a;
  IF adv_amt < 40 THEN
    RAISE EXCEPTION 'FAIL: ranking antes do clawback commission=%', adv_amt;
  END IF;
  PERFORM public.ops_clawback_commission(shop_a, entry_paid, 'rank-test');
  SELECT coalesce(sum(commission), 0) INTO adv_amt
  FROM public.ops_barber_ranking(shop_a, to_char(now(), 'YYYY-MM'))
  WHERE barber_id = barber_a;
  IF adv_amt <> 0 THEN
    RAISE EXCEPTION 'FAIL: ranking após clawback commission=% want 0', adv_amt;
  END IF;
  RAISE NOTICE 'PASS: ranking exclui entries com clawback';

  RAISE NOTICE 'FASE1B4_COMMISSIONS_SQL_PASSED';
END $$;
