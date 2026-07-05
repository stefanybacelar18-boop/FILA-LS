-- FilaDock — endurecimento de segurança para PRODUÇÃO
-- Rode UMA VEZ no SQL Editor do Supabase (idempotente).
-- Não altera lógica da fila — só fecha brechas de RLS/perfil.
-- Pré-requisito: funções is_staff(), is_admin(), is_motorista() (fix-rls-recursion.sql).

-- ========== 1. Impede motorista de promover a si mesmo a admin ==========
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / manutenção via API admin
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Alteração de role não permitida pelo próprio usuário';
    END IF;
    IF NEW.checkin_liberado IS DISTINCT FROM OLD.checkin_liberado THEN
      RAISE EXCEPTION 'Alteração de checkin_liberado não permitida pelo próprio usuário';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- ========== 2. Perfis: cada um vê o próprio; staff vê todos (admin/empilhador) ==========
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read own or staff" ON public.profiles;
CREATE POLICY "Profiles read own or staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff());

-- Atualização própria: só campos não sensíveis (role/checkin bloqueados pelo trigger)
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ========== 3. Remove leitura/inserção pública indevida na fila ==========
DROP POLICY IF EXISTS "Public read by token" ON public.queue_entries;
DROP POLICY IF EXISTS "Public check-in insert" ON public.queue_entries;

DROP POLICY IF EXISTS "History readable" ON public.queue_history;
DROP POLICY IF EXISTS "Staff read history" ON public.queue_history;
CREATE POLICY "Staff read history" ON public.queue_history
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Garante check-in só motorista autenticado (API)
DROP POLICY IF EXISTS "Motorista check-in insert" ON public.queue_entries;
CREATE POLICY "Motorista check-in insert" ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_motorista());

-- ========== 4. Verificação rápida ==========
SELECT
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'queue_entries' AND policyname = 'Public read by token'
  ) AS ainda_tem_leitura_publica,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile_sensitive'
  ) AS trigger_perfil_ok;

SELECT 'migracao-seguranca-producao aplicada' AS status;
