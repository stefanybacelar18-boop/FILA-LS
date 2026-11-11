-- Fase 1.A — helpers de tenant/papel, colunas de profile, grants seguros
-- NÃO aplicar remotamente nesta entrega; revisão apenas.

-- Colunas de ciclo de vida do staff
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'ready';

DO $$ BEGIN
  ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_provisioning_status_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_provisioning_status_check
    CHECK (provisioning_status IN (
      'pending_email',
      'provisioning',
      'ready',
      'failed'
    ));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS profiles_shop_active_idx
  ON public.profiles (barbershop_id)
  WHERE is_active = TRUE AND provisioning_status = 'ready';

-- Helpers: SECURITY DEFINER, search_path fixo, sem parâmetro user_id injetável
CREATE OR REPLACE FUNCTION public.user_barbershop_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.barbershop_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.barbershop_id IS NOT NULL
    AND p.is_active = TRUE
    AND p.provisioning_status = 'ready'
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.is_active = TRUE
    AND p.provisioning_status = 'ready'
$$;

-- Ownership e grants (role postgres típico do projeto Supabase)
ALTER FUNCTION public.user_barbershop_id() OWNER TO postgres;
ALTER FUNCTION public.user_role() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_barbershop_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_barbershop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;
