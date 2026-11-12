-- Fase 1.B.0 — asserts SQL do registry (CHECK + grants)
-- Executado após migration 20261112_fase1b_00_ops_registry.sql

DO $$
BEGIN
  -- Roles de teste (espelha harness 1.A se já existirem)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- Re-aplicar grants da migration (service_role pode ter sido criado depois)
REVOKE ALL ON TABLE public.ops_domain_registry FROM PUBLIC;
REVOKE ALL ON TABLE public.ops_domain_registry FROM anon;
REVOKE ALL ON TABLE public.ops_domain_registry FROM authenticated;
REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM anon;
REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_domain_registry TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_domain_registry_audit TO service_role;

DO $$
DECLARE
  r RECORD;
  n INT;
  ok BOOLEAN;
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

  -- CHECK: postgres + prep_pg rejeitado
  BEGIN
    INSERT INTO public.ops_domain_registry(domain, source, state)
    VALUES ('__chk_pg_prep', 'postgres', 'prep_pg');
    RAISE EXCEPTION 'FAIL: CHECK allowed postgres/prep_pg';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects postgres/prep_pg';
  END;

  -- CHECK: postgres + cutover_pending rejeitado
  BEGIN
    INSERT INTO public.ops_domain_registry(domain, source, state)
    VALUES ('__chk_pg_cut', 'postgres', 'cutover_pending');
    RAISE EXCEPTION 'FAIL: CHECK allowed postgres/cutover_pending';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects postgres/cutover_pending';
  END;

  -- CHECK: json + active_postgres rejeitado
  BEGIN
    INSERT INTO public.ops_domain_registry(domain, source, state)
    VALUES ('__chk_json_pg', 'json', 'active_postgres');
    RAISE EXCEPTION 'FAIL: CHECK allowed json/active_postgres';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: CHECK rejects json/active_postgres';
  END;

  -- CHECK: json + cutover_pending OK (depois remove)
  INSERT INTO public.ops_domain_registry(domain, source, state)
  VALUES ('__chk_json_cut', 'json', 'cutover_pending');
  DELETE FROM public.ops_domain_registry WHERE domain = '__chk_json_cut';
  RAISE NOTICE 'PASS: CHECK allows json/cutover_pending';

  -- CHECK: postgres + active_postgres OK (depois remove)
  INSERT INTO public.ops_domain_registry(domain, source, state)
  VALUES ('__chk_pg_ok', 'postgres', 'active_postgres');
  DELETE FROM public.ops_domain_registry WHERE domain = '__chk_pg_ok';
  RAISE NOTICE 'PASS: CHECK allows postgres/active_postgres';

  -- Grants: anon sem privilegios
  ok := has_table_privilege('anon', 'public.ops_domain_registry', 'SELECT')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'INSERT')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'UPDATE')
     OR has_table_privilege('anon', 'public.ops_domain_registry', 'DELETE');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: anon still has privileges on ops_domain_registry';
  END IF;
  RAISE NOTICE 'PASS: anon sem acesso a ops_domain_registry';

  ok := has_table_privilege('anon', 'public.ops_domain_registry_audit', 'SELECT')
     OR has_table_privilege('anon', 'public.ops_domain_registry_audit', 'INSERT');
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
     OR has_table_privilege('authenticated', 'public.ops_domain_registry_audit', 'INSERT');
  IF ok THEN
    RAISE EXCEPTION 'FAIL: authenticated still has privileges on audit';
  END IF;
  RAISE NOTICE 'PASS: authenticated sem acesso a ops_domain_registry_audit';

  -- service_role tem acesso
  IF NOT has_table_privilege('service_role', 'public.ops_domain_registry', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role missing SELECT on registry';
  END IF;
  RAISE NOTICE 'PASS: service_role SELECT on ops_domain_registry';

  RAISE NOTICE 'FASE1B0_REGISTRY_SQL_PASSED';
END $$;
