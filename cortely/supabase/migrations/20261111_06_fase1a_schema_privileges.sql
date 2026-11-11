-- Fase 1.A — endurecer privilégios do schema public
-- USAGE permitido; CREATE revogado de papéis não privilegiados.
-- Preserva postgres/superuser e service_role (bypass RLS no app).

-- PUBLIC nunca deve criar objetos em public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- USAGE: necessário para resolver nomes de objetos (Supabase)
-- CREATE: apenas papéis privilegiados (postgres / donos de migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM anon';
    EXECUTE 'GRANT USAGE ON SCHEMA public TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM authenticated';
    EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- service_role não precisa CREATE no schema public para o app Cortely;
    -- migrations/DDL ficam com postgres. Mantém USAGE.
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM service_role';
    EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
  END IF;
END $$;

-- Comentário de inventário esperado (ver docs/fase1a-schema-privileges.md)
COMMENT ON SCHEMA public IS
  'Cortely 1.A: USAGE para anon/authenticated/service_role; CREATE revogado de PUBLIC/anon/authenticated/service_role';
