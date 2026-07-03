-- FILA LSL — CORREÇÃO: infinite recursion detected in policy for relation "profiles"
-- Rode em NOVA ABA do SQL Editor do Supabase (pode rodar quantas vezes precisar)

-- Funções auxiliares bypassam RLS (SECURITY DEFINER) — evitam recursão
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_motorista()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'motorista'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('empilhador', 'operador', 'supervisor', 'administrador')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('supervisor', 'administrador')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'administrador'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_motorista() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ========== PROFILES (causa raiz da recursão) ==========
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Garantir leitura para autenticados (login / guards)
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ========== SETTINGS ==========
DROP POLICY IF EXISTS "Settings readable by staff" ON public.settings;
CREATE POLICY "Settings readable by staff" ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin());

DROP POLICY IF EXISTS "Settings writable by admin" ON public.settings;
CREATE POLICY "Settings writable by admin" ON public.settings
  FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin())
  WITH CHECK (public.is_supervisor_or_admin());

-- ========== QUEUE_ENTRIES ==========
DROP POLICY IF EXISTS "Staff update queue" ON public.queue_entries;
DROP POLICY IF EXISTS "Empilhador update queue" ON public.queue_entries;
CREATE POLICY "Staff update queue" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff read queue" ON public.queue_entries;
CREATE POLICY "Staff read queue" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Motorista read own queue" ON public.queue_entries;
DROP POLICY IF EXISTS "Driver read own entries" ON public.queue_entries;
CREATE POLICY "Motorista read own queue" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid());

DROP POLICY IF EXISTS "Public check-in insert" ON public.queue_entries;
DROP POLICY IF EXISTS "Motorista check-in insert" ON public.queue_entries;
CREATE POLICY "Motorista check-in insert" ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_motorista());

-- ========== QUEUE_HISTORY ==========
DROP POLICY IF EXISTS "Staff insert history notes" ON public.queue_history;
CREATE POLICY "Staff insert history notes" ON public.queue_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

-- ========== CHECKIN_AUDIT_LOG ==========
DROP POLICY IF EXISTS "Staff read audit log" ON public.checkin_audit_log;
CREATE POLICY "Staff read audit log" ON public.checkin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_staff());

SELECT 'RLS corrigido — recursão eliminada!' AS status;

-- Teste rápido (deve retornar seu perfil sem erro):
-- SELECT id, email, role FROM public.profiles WHERE id = auth.uid();
