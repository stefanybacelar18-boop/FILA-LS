-- Fase 1.B.0 — Registry global de fontes ops (ops_domain_registry)
-- Aplicar SOMENTE em Postgres local/CI. Nunca no Supabase remoto nesta autorização.
-- Infra: ENABLE+FORCE RLS; REVOKE anon/authenticated; service_role append-friendly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ops_domain_registry (
  domain TEXT PRIMARY KEY
    CHECK (domain IN (
      'products', 'stock', 'cash', 'sales', 'commissions', 'packages',
      'purchasing', 'payables', 'receivables', 'coupons', 'deposits',
      'campaigns', 'waitlist', 'reviews', 'fiscal', 'payment_intents'
    )),
  source TEXT NOT NULL CHECK (source IN ('json', 'postgres')),
  state TEXT NOT NULL CHECK (state IN (
    'active_json',
    'prep_pg',
    'cutover_pending',
    'active_postgres'
  )),
  cutover_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NULL,
  CONSTRAINT ops_registry_source_state_ck CHECK (
    (source = 'json' AND state IN ('active_json', 'prep_pg', 'cutover_pending'))
    OR
    (source = 'postgres' AND state = 'active_postgres')
  ),
  CONSTRAINT ops_registry_cutover_at_ck CHECK (
    state <> 'active_postgres' OR cutover_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.ops_domain_registry_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NULL,
  action TEXT NOT NULL,
  domain TEXT NULL,
  source_from TEXT NULL,
  state_from TEXT NULL,
  source_to TEXT NULL,
  state_to TEXT NULL,
  cutover_set TEXT NULL,
  reason TEXT NULL,
  fingerprint TEXT NULL,
  details JSONB NULL
);

COMMENT ON TABLE public.ops_domain_registry IS
  'Cortely 1.B.0: registry global (não por tenant) da fonte oficial por domínio ops';
COMMENT ON TABLE public.ops_domain_registry_audit IS
  'Cortely 1.B.0: auditoria append-only do registry (seed/transições)';

ALTER TABLE public.ops_domain_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_domain_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ops_domain_registry_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_domain_registry_audit FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_domain_registry', 'ops_domain_registry_audit']
  LOOP
    SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      INTO r
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    IF NOT r.rls OR NOT r.force_rls THEN
      RAISE EXCEPTION
        'Falha de segurança: public.% deve ter ENABLE+FORCE RLS (rls=%, force=%)',
        t, r.rls, r.force_rls;
    END IF;
  END LOOP;
END $$;

-- Revoga herança de DEFAULT PRIVILEGES / PUBLIC
REVOKE ALL ON TABLE public.ops_domain_registry FROM PUBLIC;
REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM authenticated';
  END IF;
  -- Append-only: registry sem DELETE; audit só SELECT+INSERT
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry FROM service_role';
    EXECUTE 'REVOKE ALL ON TABLE public.ops_domain_registry_audit FROM service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.ops_domain_registry TO service_role';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.ops_domain_registry_audit TO service_role';
  END IF;
END $$;

INSERT INTO public.ops_domain_registry (domain, source, state, updated_at, updated_by)
VALUES
  ('products', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('stock', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('cash', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('sales', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('commissions', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('packages', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('purchasing', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('payables', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('receivables', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('coupons', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('deposits', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('campaigns', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('waitlist', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('reviews', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('fiscal', 'json', 'active_json', now(), 'fase1b_00_seed'),
  ('payment_intents', 'json', 'active_json', now(), 'fase1b_00_seed')
ON CONFLICT (domain) DO NOTHING;

-- Fingerprint idêntico ao TS: sha256(hex).slice(0,16) na ordem OPS_DOMAINS
INSERT INTO public.ops_domain_registry_audit (
  changed_by, action, cutover_set, reason, fingerprint, details
)
SELECT
  'fase1b_00_seed',
  'seed',
  NULL,
  'initial all-json registry',
  left(encode(digest(
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
  ), 'hex'), 16),
  jsonb_build_object(
    'domains', (SELECT count(*)::int FROM public.ops_domain_registry),
    'migration', '20261112_fase1b_00_ops_registry'
  )
FROM public.ops_domain_registry
WHERE NOT EXISTS (
  SELECT 1 FROM public.ops_domain_registry_audit WHERE action = 'seed'
);
