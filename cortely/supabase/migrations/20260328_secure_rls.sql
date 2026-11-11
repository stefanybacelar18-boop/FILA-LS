-- Harden RLS: remove public appointment read, stop self-serve owner profiles

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'barber';

DROP POLICY IF EXISTS "Public create appointments" ON public.appointments;
DROP POLICY IF EXISTS "Public read own appointments by phone" ON public.appointments;
DROP POLICY IF EXISTS "Owner manage profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.user_barbershop_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT barbershop_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE POLICY "Read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Update own profile safe"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.user_role()
    AND barbershop_id IS NOT DISTINCT FROM public.user_barbershop_id()
  );
