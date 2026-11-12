-- Asserts SQL 1.B.3-G — grants, terminals, quarantine attempts, RLS
\set ON_ERROR_STOP on

DO $$
DECLARE
  shop_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  shop_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  shop_c UUID := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  user_a UUID := '11111111-1111-4111-8111-1111111111a1';
  user_b UUID := '22222222-2222-4222-8222-2222222222b2';
  user_c UUID := '33333333-3333-4333-8333-3333333333c3';
  intent_a UUID;
  n INT;
  has_exec BOOLEAN;
  st TEXT;
  r RECORD;
BEGIN
  INSERT INTO public.barbershops (id, name, slug) VALUES
    (shop_a, 'Shop A', 'shop-a'),
    (shop_b, 'Shop B', 'shop-b'),
    (shop_c, 'Shop C', 'shop-c');
  INSERT INTO public.profiles (id, barbershop_id, full_name, email, role) VALUES
    (user_a, shop_a, 'A', 'a@t', 'owner'),
    (user_b, shop_b, 'B', 'b@t', 'owner'),
    (user_c, shop_c, 'C', 'c@t', 'owner');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_id_barbershop_uidx'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing appointments_id_barbershop_uidx';
  END IF;
  RAISE NOTICE 'PASS: appointments UNIQUE (id, barbershop_id)';

  INSERT INTO public.payment_provider_accounts (
    barbershop_id, provider, external_account_id
  ) VALUES (shop_a, 'fake', 'acct_a');

  INSERT INTO public.payment_intents (
    id, barbershop_id, provider, provider_ref, amount, method, status, purpose
  ) VALUES (
    gen_random_uuid(), shop_a, 'fake', 'ref-a-1', 50, 'pix', 'pending', 'appointment'
  ) RETURNING id INTO intent_a;

  -- paid terminal: pending event não regride
  PERFORM public.ops_apply_payment_webhook(
    'fake', 'evt-paid-1', 'ref-a-1', 'paid', 50,
    '{"provider_event_id":"evt-paid-1","provider_ref":"ref-a-1","status":"paid","amount":50}'::jsonb,
    TRUE
  );
  SELECT status INTO st FROM public.payment_intents WHERE id = intent_a;
  IF st <> 'paid' THEN RAISE EXCEPTION 'FAIL: not paid'; END IF;

  PERFORM public.ops_apply_payment_webhook(
    'fake', 'evt-pending-late', 'ref-a-1', 'pending', 50,
    '{"provider_event_id":"evt-pending-late","provider_ref":"ref-a-1","status":"pending","amount":50}'::jsonb,
    TRUE
  );
  SELECT status INTO st FROM public.payment_intents WHERE id = intent_a;
  IF st <> 'paid' THEN RAISE EXCEPTION 'FAIL: regressão paid→pending'; END IF;
  RAISE NOTICE 'PASS: paid terminal — pending posterior não regride';

  -- duplicate event
  SELECT * INTO r FROM public.ops_apply_payment_webhook(
    'fake', 'evt-paid-1', 'ref-a-1', 'paid', 50,
    '{"provider_event_id":"evt-paid-1","provider_ref":"ref-a-1","status":"paid","amount":50}'::jsonb,
    TRUE
  );
  IF r.result <> 'duplicate' THEN
    RAISE EXCEPTION 'FAIL: duplicate expected, got %', r.result;
  END IF;
  RAISE NOTICE 'PASS: evento duplicado → duplicate';

  -- amount_mismatch
  INSERT INTO public.payment_intents (
    barbershop_id, provider, provider_ref, amount, method, status, purpose
  ) VALUES (shop_a, 'fake', 'ref-a-2', 70, 'pix', 'pending', 'sale');
  SELECT * INTO r FROM public.ops_apply_payment_webhook(
    'fake', 'evt-amt', 'ref-a-2', 'paid', 99,
    '{"provider_event_id":"evt-amt","provider_ref":"ref-a-2","status":"paid","amount":99}'::jsonb,
    TRUE
  );
  IF r.result <> 'quarantined_amount_mismatch' THEN
    RAISE EXCEPTION 'FAIL: amount_mismatch got %', r.result;
  END IF;
  SELECT status INTO st FROM public.payment_intents WHERE provider_ref = 'ref-a-2';
  IF st <> 'pending' THEN RAISE EXCEPTION 'FAIL: intent alterada em mismatch'; END IF;
  RAISE NOTICE 'PASS: amount_mismatch → quarentena; intent pending';

  -- intent missing → quarentena; 3x → attempts=3
  PERFORM public.ops_quarantine_payment_webhook(
    'fake', 'evt-miss', '{"x":1}'::jsonb, 'intent_missing', TRUE
  );
  PERFORM public.ops_quarantine_payment_webhook(
    'fake', 'evt-miss', '{"x":2}'::jsonb, 'intent_missing', TRUE
  );
  PERFORM public.ops_quarantine_payment_webhook(
    'fake', 'evt-miss', '{"x":3}'::jsonb, 'intent_missing', TRUE
  );
  SELECT attempts INTO n FROM public.payment_webhook_quarantine
  WHERE provider = 'fake' AND provider_event_id = 'evt-miss';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: attempts=%', n; END IF;
  SELECT count(*) INTO n FROM public.payment_webhook_quarantine
  WHERE provider_event_id = 'evt-miss';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: quarantine rows=%', n; END IF;
  RAISE NOTICE 'PASS: P16 attempts=3 numa linha';

  -- grants EXECUTE
  SELECT has_function_privilege(
    'authenticated',
    'public.ops_apply_payment_webhook(text,text,text,text,numeric,jsonb,boolean)',
    'EXECUTE'
  ) INTO has_exec;
  IF has_exec THEN RAISE EXCEPTION 'FAIL: authenticated EXECUTE apply'; END IF;
  SELECT has_function_privilege(
    'anon',
    'public.ops_reprocess_payment_quarantine(uuid)',
    'EXECUTE'
  ) INTO has_exec;
  IF has_exec THEN RAISE EXCEPTION 'FAIL: anon EXECUTE reprocess'; END IF;
  SELECT has_function_privilege(
    'service_role',
    'public.ops_apply_payment_webhook(text,text,text,text,numeric,jsonb,boolean)',
    'EXECUTE'
  ) INTO has_exec;
  IF NOT has_exec THEN RAISE EXCEPTION 'FAIL: service_role sem EXECUTE'; END IF;
  RAISE NOTICE 'PASS: EXECUTE só service_role';

  -- authenticated SELECT só próprio tenant
  INSERT INTO public.payment_intents (
    barbershop_id, provider, provider_ref, amount, method, status, purpose
  ) VALUES
    (shop_b, 'fake', 'ref-b', 10, 'pix', 'pending', 'other'),
    (shop_c, 'fake', 'ref-c', 10, 'pix', 'pending', 'other');

  EXECUTE 'SET ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SELECT count(*) INTO n FROM public.payment_intents;
  IF n < 1 THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL: A não lê próprias intents';
  END IF;
  -- todas as linhas visíveis devem ser shop_a
  IF EXISTS (
    SELECT 1 FROM public.payment_intents WHERE barbershop_id <> shop_a
  ) THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL: A leu intent de outro tenant';
  END IF;
  BEGIN
    SELECT count(*) INTO n FROM public.payment_webhook_quarantine;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL: authenticated acessou quarantine';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'PASS: authenticated sem acesso à quarentena';
  END;
  BEGIN
    EXECUTE 'SET ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    SELECT count(*) INTO n FROM public.payment_webhook_events;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FAIL: authenticated acessou events';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'PASS: authenticated sem acesso a events';
  END;
  RAISE NOTICE 'PASS: isolamento 3 barbearias (SELECT intents)';

END $$;

SELECT 'FASE1B3G_GATEWAY_SQL_PASSED' AS status;
