-- ============================================================
-- FILA LSL — RESET COMPLETO
-- Apaga TUDO do projeto para recomeçar do zero
-- Seguro mesmo se o banco estiver vazio (sem tabelas ainda)
--
-- COMO USAR:
-- 1. Nova aba no SQL Editor do Supabase
-- 2. Cole e rode TODO este arquivo
-- 3. Depois rode: setup-completo.sql
-- ============================================================

-- Realtime (ignora se não estiver adicionado)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.queue_entries;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;

-- Tabelas primeiro (CASCADE remove triggers dependentes)
DROP TABLE IF EXISTS public.checkin_audit_log CASCADE;
DROP TABLE IF EXISTS public.queue_history CASCADE;
DROP TABLE IF EXISTS public.queue_entries CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Trigger em auth.users (auth.users sempre existe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Funções
DROP FUNCTION IF EXISTS public.get_active_queue_summary() CASCADE;
DROP FUNCTION IF EXISTS public.get_queue_by_token(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_motorista() CASCADE;
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;
DROP FUNCTION IF EXISTS public.is_supervisor_or_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_recalculate_positions() CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_queue_positions() CASCADE;
DROP FUNCTION IF EXISTS public.log_queue_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- Tipos ENUM
DROP TYPE IF EXISTS public.queue_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

SELECT 'Reset completo! Agora rode setup-completo.sql' AS status;
