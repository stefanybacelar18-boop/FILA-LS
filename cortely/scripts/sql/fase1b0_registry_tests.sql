-- Fase 1.B.0 — asserts SQL do registry (CHECK + grants).
-- SOMENTE verificação: sem REVOKE/GRANT neste arquivo.
-- Roles e DEFAULT PRIVILEGES são preparados no runner TS antes da migration.

DO $$
DECLARE
  r RECORD;
  n INT;
  ok BOOLEAN;
  fp TEXT;
BEGIN
  -- Seed: 16 domínios
  SELECT count(*) INTO n FROM public.ops_domain_registry;
  IF n <> 16 THEN
    RAISE EXCEPTION 'FAIL: expected 16 domains, got %', n;
  END IF;
  RAISE NOTICE 'PASS: seed has 16 domains';

  SELECT count(*) INTO n FROM public.ops_domain_registry_audit WHERE action = 'seed';
  IF n < 1 THEN
    RAISE EXCEPTION 'FAIL: missing seed audit row';
  END IF;
  RAISE NOTICE 'PASS: seed audit row present';

  -- FORCE RLS
  SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
    INTO r
  FROM pg_class c
  JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
  WHERE nsp.nspname = 'public' AND c.relname = 'ops_domain_registry';
  IF NOT r.rls OR NOT r.force_rls THEN
    RAISE EXCEPTION 'FAIL: ops_domain_registry FORCE RLS missing';
  END IF;
  RAISE NOTICE 'PASS: ops_domain_registry ENABLE+FORCE RLS';

  SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
    INTO r
  FROM pg_class c
  JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
  WHERE nsp.nspname = 'public' AND c.relname = 'ops_domain_registry_audit';
  IF NOT r.rls OR NOT r.force_rls THEN
    RAISE EXCEPTION 'FAIL: ops_domain_registry_audit FORCE RLS missing';
  END IF;
  RAISE NOTICE 'PASS: ops_domain_registry_audit ENABLE+FORCE RLS';

  -- CHECK: postgres + prep_pg rejeitado (via UPDATE em domínio válido)
  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'postgres', state = 'prep_pg', cutover_at = now()
    WHERE domain = 'sales';
    RAISE EXCEPTION 'FAIL: CHECK allowed postgres/prep_pg';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects postgres/prep_pg';
  END;

  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'postgres', state = 'cutover_pending', cutover_at = now()
    WHERE domain = 'sales';
    RAISE EXCEPTION 'FAIL: CHECK allowed postgres/cutover_pending';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects postgres/cutover_pending';
  END;

  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'json', state = 'active_postgres', cutover_at = now()
    WHERE domain = 'sales';
    RAISE EXCEPTION 'FAIL: CHECK allowed json/active_postgres';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects json/active_postgres';
  END;

  -- active_postgres sem cutover_at rejeitado
  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'postgres', state = 'active_postgres', cutover_at = NULL
    WHERE domain = 'sales';
    RAISE EXCEPTION 'FAIL: CHECK allowed active_postgres without cutover_at';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects active_postgres without cutover_at';
  END;

  -- domain desconhecido rejeitado
  BEGIN
    INSERT INTO public.ops_domain_registry(domain, source, state)
    VALUES ('units', 'json', 'active_json');
    RAISE EXCEPTION 'FAIL: CHECK allowed unknown domain units';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects unknown domain';
  END;

  -- json/cutover_pending OK (rollback via exceção de restore desnecessário — savepoint)
  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'json', state = 'cutover_pending', cutover_at = NULL
    WHERE domain = 'sales';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FAIL: sales missing';
    END IF;
    -- desfaz
    UPDATE public.ops_domain_registry
    SET source = 'json', state = 'active_json', cutover_at = NULL, updated_by = 'fase1b_00_seed'
    WHERE domain = 'sales';
  END;
  RAISE NOTICE 'PASS: CHECK allows json/cutover_pending';

  -- postgres/active_postgres com cutover_at OK, depois restaura
  BEGIN
    UPDATE public.ops_domain_registry
    SET source = 'postgres', state = 'active_postgres', cutover_at = now()
    WHERE domain = 'sales';
    UPDATE public.ops_domain_registry
    SET source = 'json', state = 'active_json', cutover_at = NULL, updated_by = 'fase1b_00_seed'
    WHERE domain = 'sales';
  END;
  RAISE NOTICE 'PASS: CHECK allows postgres/active_postgres with cutover_at';

  -- Grants: anon sem privilégios (migration deve ter revogado DEFAULT PRIVILEGES)
  ok := has_table_privilege('anon', 'public.ops_domain_registry', 'SELECT')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'INSERT')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'UPDATE')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: anon still has privileges on ops_domain_registry';
  END IF;
  RAISE NOTICE 'PASS: anon sem acesso a ops_domain_registry';

  ok := has_table_privilege('anon', 'public.ops_domain_registry_audit', 'SELECT')
     OR has_table_privilege('anon', 'public.ops_domain_registry_audit', 'INSERT')
     OR has_table_privilege('anon', 'public.ops_domain_registry_audit', 'UPDATE')
     OR has_table_privilege('anon', 'public.ops_domain_registry_audit', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: anon still has privileges on ops_domain_registry_audit';
  END IF;
  RAISE NOTICE 'PASS: anon sem acesso a ops_domain_registry_audit';

  ok := has_table_privilege('authenticated', 'public.ops_domain_registry', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated still has privileges on ops_domain_registry';
  END IF;
  RAISE NOTICE 'PASS: authenticated sem acesso a ops_domain_registry';

  ok := has_table_privilege('authenticated', 'public.ops_domain_registry_audit', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry_audit', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry_audit', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ops_domain_registry_audit', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated still has privileges on audit';
  END IF;
  RAISE NOTICE 'PASS: authenticated sem acesso a ops_domain_registry_audit';

  -- service_role: registry SELECT+INSERT+UPDATE, sem DELETE
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role missing SELECT on registry';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: service_role missing INSERT on registry';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL: service_role missing UPDATE on registry';
  END IF;
  IF has_table_privilege('service_role', 'public.ops_domain_registry', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: service_role must NOT have DELETE on registry';
  END IF;
  RAISE NOTICE 'PASS: service_role registry SELECT/INSERT/UPDATE sem DELETE';

  -- service_role: audit SELECT+INSERT, sem UPDATE/DELETE
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry_audit', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role missing SELECT on audit';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry_audit', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: service_role missing INSERT on audit';
  END IF;
  IF has_table_privilege('service_role', 'public.ops_domain_registry_audit', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL: service_role must NOT have UPDATE on audit';
  END IF;
  IF has_table_privilege('service_role', 'public.ops_domain_registry_audit', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: service_role must NOT have DELETE on audit';
  END IF;
  RAISE NOTICE 'PASS: service_role audit SELECT/INSERT sem UPDATE/DELETE';

  -- Fingerprint SQL (mesmo algoritmo/ordem do TS)
  SELECT left(encode(digest(
    string_agg(
      domain || ':' || source || ':' || state,
      ','
      ORDER BY array_position(
        ARRAY[
          'products','stock','cash','sales','commissions','packages',
          'purchasing','payables','receivables','coupons','deposits',
          'campaigns','waitlist','reviews','fiscal','payment_intents'
        ]::text[],
        domain
      )
    ),
    'sha256'
  ), 'hex'), 16)
  INTO fp
  FROM public.ops_domain_registry;

  IF fp IS NULL OR length(fp) <> 16 THEN
    RAISE EXCEPTION 'FAIL: fingerprint sql invalid: %', fp;
  END IF;
  RAISE NOTICE 'PASS: fingerprint sql=%', fp;

  -- Audit seed fingerprint bate com o cálculo
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_domain_registry_audit
    WHERE action = 'seed' AND fingerprint = fp
  ) THEN
    RAISE EXCEPTION 'FAIL: seed audit fingerprint mismatch (got sql fp=%)', fp;
  END IF;
  RAISE NOTICE 'PASS: seed audit fingerprint matches sql algorithm';

  RAISE NOTICE 'FASE1B0_REGISTRY_SQL_PASSED';
END $$;
