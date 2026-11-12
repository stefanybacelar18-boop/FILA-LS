-- Asserts SQL 1.B.2 — tenant sale_*, tendered/applied, kind/direction, append-only, grants
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  user_b UUID := '22222222-2222-4222-8222-2222222222b2';
  user_c UUID := '33333333-3333-4333-8333-3333333333c3';
  sess_a UUID;
  sale_a UUID;
  pay_a UUID;
  pay_card UUID;
  n INT;
  conf RECORD;
  closed RECORD;
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

  -- UNIQUE compostos
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing sales_id_barbershop_uidx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing sale_payments_id_barbershop_uidx';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_sessions_id_barbershop_uidx') THEN
    RAISE EXCEPTION 'FAIL: missing cash_sessions_id_barbershop_uidx';
  END IF;
  RAISE NOTICE 'PASS: UNIQUE (id, barbershop_id) sales/payments/sessions';

  -- Policies diretas (não via JOIN)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_payments'
      AND policyname = 'sale_payments_via_sales'
  ) THEN
    RAISE EXCEPTION 'FAIL: sale_payments_via_sales ainda existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_payments'
      AND policyname = 'sale_payments_tenant_all'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing sale_payments_tenant_all';
  END IF;
  RAISE NOTICE 'PASS: policies diretas por barbershop_id';

  -- Coluna type legado removida; kind/direction presentes
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cash_movements' AND column_name = 'type'
  ) THEN
    RAISE EXCEPTION 'FAIL: coluna type legado ainda existe';
  END IF;
  RAISE NOTICE 'PASS: type legado removido; kind/direction ativos';

  -- Abrir caixa A
  SELECT session_id INTO sess_a
  FROM public.ops_open_cash(shop_a, 'owner-a', 100, 'open-a');
  IF sess_a IS NULL THEN RAISE EXCEPTION 'FAIL: open cash'; END IF;
  RAISE NOTICE 'PASS: ops_open_cash';

  -- Segundo open → 409
  BEGIN
    PERFORM public.ops_open_cash(shop_a, 'owner-a', 1, NULL);
    RAISE EXCEPTION 'FAIL: double open allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%CASH_ALREADY_OPEN%' OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: segundo open → CASH_ALREADY_OPEN';
    ELSE
      RAISE;
    END IF;
  END;

  -- Manual in/out
  PERFORM public.ops_add_cash_movement(shop_a, 'manual_in', 50, 'suprimento', 'owner-a');
  PERFORM public.ops_add_cash_movement(shop_a, 'manual_out', 20, 'sangria', 'owner-a');

  SELECT * INTO conf FROM public.ops_cash_conference(shop_a, NULL);
  IF conf.expected_cash <> 130 THEN
    RAISE EXCEPTION 'FAIL: expected_cash=% (want 130)', conf.expected_cash;
  END IF;
  RAISE NOTICE 'PASS: conference ledger 100+50-20=130';

  -- CHECK kind ↔ direction / sale_payment
  BEGIN
    INSERT INTO public.cash_movements (
      barbershop_id, cash_session_id, direction, kind, amount, reason, created_by
    ) VALUES (shop_a, sess_a, 'out', 'manual_in', 10, 'bad dir', 'x');
    RAISE EXCEPTION 'FAIL: manual_in com direction=out permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: manual_in exige direction=in';
  END;
  BEGIN
    INSERT INTO public.cash_movements (
      barbershop_id, cash_session_id, direction, kind, amount, reason, created_by
    ) VALUES (shop_a, sess_a, 'in', 'manual_out', 10, 'bad dir', 'x');
    RAISE EXCEPTION 'FAIL: manual_out com direction=in permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: manual_out exige direction=out';
  END;
  BEGIN
    INSERT INTO public.cash_movements (
      barbershop_id, cash_session_id, direction, kind, amount, reason, created_by
    ) VALUES (shop_a, sess_a, 'in', 'sale_cash_in', 10, 'sem pay', 'x');
    RAISE EXCEPTION 'FAIL: sale_cash_in sem sale_payment_id permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: sale_cash_in exige sale_payment_id';
  END;
  BEGIN
    INSERT INTO public.cash_movements (
      barbershop_id, cash_session_id, direction, kind, amount, reason, created_by
    ) VALUES (shop_a, sess_a, 'out', 'change', 10, 'sem pay', 'x');
    RAISE EXCEPTION 'FAIL: change sem sale_payment_id permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: change exige sale_payment_id';
  END;

  -- Venda R$70, cash tendered 100 / applied 70 → entrada 100 + troco 30
  INSERT INTO public.sales (
    id, barbershop_id, cash_session_id, subtotal, discount, total, status, created_by
  ) VALUES (
    gen_random_uuid(), shop_a, sess_a, 70, 0, 70, 'paid', 'owner-a'
  ) RETURNING id INTO sale_a;

  INSERT INTO public.sale_payments (
    id, sale_id, barbershop_id, method, amount, tendered_amount, applied_amount
  ) VALUES (
    gen_random_uuid(), sale_a, shop_a, 'cash', 70, 100, 70
  ) RETURNING id INTO pay_a;

  INSERT INTO public.cash_movements (
    barbershop_id, cash_session_id, sale_payment_id, direction, kind, amount, reason, created_by
  ) VALUES
    (shop_a, sess_a, pay_a, 'in', 'sale_cash_in', 100, 'cash tendered', 'owner-a'),
    (shop_a, sess_a, pay_a, 'out', 'change', 30, 'troco', 'owner-a');
  RAISE NOTICE 'PASS: combinações válidas sale_cash_in/in + change/out';

  -- change com direction=in rejeitado (mesmo com payment)
  BEGIN
    INSERT INTO public.cash_movements (
      barbershop_id, cash_session_id, sale_payment_id, direction, kind, amount, reason, created_by
    ) VALUES (shop_a, sess_a, pay_a, 'in', 'change', 5, 'bad change in', 'x');
    RAISE EXCEPTION 'FAIL: change/in permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: change exige direction=out';
  END;

  SELECT * INTO conf FROM public.ops_cash_conference(shop_a, sess_a);
  -- 100 + 50 - 20 + 100 - 30 = 200
  IF conf.expected_cash <> 200 THEN
    RAISE EXCEPTION 'FAIL: expected com troco=% (want 200)', conf.expected_cash;
  END IF;
  IF COALESCE((conf.by_method->>'cash')::numeric, 0) <> 70 THEN
    RAISE EXCEPTION 'FAIL: by_method.cash=%', conf.by_method;
  END IF;
  RAISE NOTICE 'PASS: R$100 tendered / R$70 applied → esperado 200; by_method.cash=70';

  -- Cartão com tendered ≠ applied → rejeitado
  BEGIN
    INSERT INTO public.sale_payments (
      sale_id, barbershop_id, method, amount, tendered_amount, applied_amount
    ) VALUES (sale_a, shop_a, 'card', 10, 20, 10);
    RAISE EXCEPTION 'FAIL: card tendered≠applied permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: cartão exige tendered=applied';
  END;

  -- tendered < applied → rejeitado
  BEGIN
    INSERT INTO public.sale_payments (
      sale_id, barbershop_id, method, amount, tendered_amount, applied_amount
    ) VALUES (sale_a, shop_a, 'cash', 10, 5, 10);
    RAISE EXCEPTION 'FAIL: tendered < applied permitido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: tendered >= applied';
  END;

  -- Fechar
  SELECT * INTO closed FROM public.ops_close_cash(shop_a, 'owner-a', 200);
  IF closed.status <> 'closed' OR closed.difference <> 0 THEN
    RAISE EXCEPTION 'FAIL: close status/diff';
  END IF;
  RAISE NOTICE 'PASS: ops_close_cash';

  BEGIN
    PERFORM public.ops_close_cash(shop_a, 'owner-a', 200);
    RAISE EXCEPTION 'FAIL: double close allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%CASH_NOT_OPEN%' OR SQLERRM LIKE '%CASH_ALREADY_CLOSED%'
       OR SQLSTATE = 'PT409' THEN
      RAISE NOTICE 'PASS: segundo close → 409';
    ELSE
      RAISE;
    END IF;
  END;

  -- Histórico: DELETE sessão com movements → RESTRICT
  BEGIN
    DELETE FROM public.cash_sessions WHERE id = sess_a;
    RAISE EXCEPTION 'FAIL: delete session with history allowed';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: DELETE sessão com histórico bloqueado (RESTRICT)';
  END;

  -- Append-only: authenticated sem UPDATE/DELETE em cash_movements
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    BEGIN
      UPDATE public.cash_movements SET amount = 1 WHERE cash_session_id = sess_a;
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'FAIL: authenticated UPDATE cash_movements permitido';
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
      RAISE NOTICE 'PASS: authenticated sem UPDATE em cash_movements';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
    END;
  END;
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    BEGIN
      DELETE FROM public.cash_movements WHERE cash_session_id = sess_a;
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'FAIL: authenticated DELETE cash_movements permitido';
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
      RAISE NOTICE 'PASS: authenticated sem DELETE em cash_movements (append-only)';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
    END;
  END;

  -- Isolamento: 3 barbearias — B abre próprio caixa
  PERFORM public.ops_open_cash(shop_b, 'owner-b', 10, NULL);
  PERFORM public.ops_open_cash(shop_c, 'owner-c', 5, NULL);
  SELECT count(*) INTO n FROM public.cash_sessions WHERE status = 'open';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL: open sessions count=%', n;
  END IF;
  RAISE NOTICE 'PASS: isolamento 3 barbearias (A closed, B+C open)';

  -- authenticated / anon sem EXECUTE nas funções novas
  SELECT has_function_privilege('authenticated', 'public.ops_open_cash(uuid,text,numeric,text)', 'EXECUTE')
    INTO has_exec;
  IF has_exec THEN
    RAISE EXCEPTION 'FAIL: authenticated tem EXECUTE em ops_open_cash';
  END IF;
  SELECT has_function_privilege('anon', 'public.ops_close_cash(uuid,text,numeric)', 'EXECUTE')
    INTO has_exec;
  IF has_exec THEN
    RAISE EXCEPTION 'FAIL: anon tem EXECUTE em ops_close_cash';
  END IF;
  SELECT has_function_privilege('service_role', 'public.ops_cash_conference(uuid,uuid)', 'EXECUTE')
    INTO has_exec;
  IF NOT has_exec THEN
    RAISE EXCEPTION 'FAIL: service_role sem EXECUTE em ops_cash_conference';
  END IF;
  RAISE NOTICE 'PASS: EXECUTE só service_role (P18 antecipado nas funções novas)';

  -- Unique parcial: um open por shop
  BEGIN
    INSERT INTO public.cash_sessions (barbershop_id, opened_by, opening_amount, status)
    VALUES (shop_b, 'x', 1, 'open');
    RAISE EXCEPTION 'FAIL: dois open na mesma shop';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: UNIQUE parcial um caixa open por barbearia';
  END;

END $$;

SELECT 'FASE1B2_CASH_SQL_PASSED' AS status;
