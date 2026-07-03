-- ============================================================
-- FILA LSL — SETUP COMPLETO (banco limpo)
-- Rode DEPOIS de reset-completo.sql
--
-- COMO USAR:
-- 1. Nova aba no SQL Editor
-- 2. Cole e rode TODO este arquivo de uma vez
-- 3. Crie usuário em Authentication → Users (Auto Confirm User)
-- 4. Rode: criar-admin.sql (troque o e-mail)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos
CREATE TYPE public.user_role AS ENUM (
  'motorista', 'empilhador', 'operador', 'supervisor', 'administrador'
);

CREATE TYPE public.queue_status AS ENUM (
  'aguardando', 'chamado', 'em_deslocamento', 'em_descarga',
  'aguardando_carregamento_racks', 'finalizado', 'ausente', 'cancelado'
);

-- Tabelas
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE public.queue_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  telefone TEXT NOT NULL,
  placa TEXT NOT NULL,
  transportadora TEXT NOT NULL,
  empresa TEXT NOT NULL,
  tipo_carga TEXT NOT NULL,
  observacoes TEXT,
  status public.queue_status NOT NULL DEFAULT 'aguardando',
  doca TEXT,
  previsao_descarregamento TIMESTAMPTZ,
  posicao_fila INTEGER,
  checkin_lat DOUBLE PRECISION,
  checkin_lng DOUBLE PRECISION,
  called_at TIMESTAMPTZ,
  started_unload_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.queue_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_entry_id UUID NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  old_status public.queue_status,
  new_status public.queue_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  changed_by_name TEXT,
  notes TEXT,
  doca TEXT,
  previsao_descarregamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_queue_entries_status ON public.queue_entries(status);
CREATE INDEX idx_queue_entries_token ON public.queue_entries(token);
CREATE INDEX idx_queue_entries_created_at ON public.queue_entries(created_at);
CREATE INDEX idx_queue_entries_placa ON public.queue_entries(placa);
CREATE INDEX idx_queue_history_entry ON public.queue_history(queue_entry_id);
CREATE INDEX idx_queue_history_created ON public.queue_history(created_at);

-- Geofence padrão
INSERT INTO public.settings (key, value) VALUES (
  'geofence',
  '{"lat": -23.5505, "lng": -46.6333, "radius_meters": 500, "name": "LSL - Centro de Descarga"}'
);

-- Funções
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_queue_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR
     OLD.doca IS DISTINCT FROM NEW.doca OR
     OLD.previsao_descarregamento IS DISTINCT FROM NEW.previsao_descarregamento THEN
    INSERT INTO public.queue_history (
      queue_entry_id, old_status, new_status, doca, previsao_descarregamento, notes
    ) VALUES (
      NEW.id, OLD.status, NEW.status, NEW.doca, NEW.previsao_descarregamento,
      CASE
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Status alterado'
        WHEN OLD.doca IS DISTINCT FROM NEW.doca THEN 'Doca alterada'
        ELSE 'Previsão atualizada'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_queue_positions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS pos
    FROM public.queue_entries
    WHERE status IN ('aguardando', 'chamado', 'em_deslocamento')
  )
  UPDATE public.queue_entries q
  SET posicao_fila = r.pos
  FROM ranked r WHERE q.id = r.id;

  UPDATE public.queue_entries
  SET posicao_fila = NULL
  WHERE status NOT IN ('aguardando', 'chamado', 'em_deslocamento');
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_positions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recalculate_queue_positions();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'motorista')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER queue_entries_updated_at
  BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER queue_status_history
  AFTER UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_queue_status_change();

CREATE TRIGGER recalc_positions_after_insert
  AFTER INSERT ON public.queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_recalculate_positions();

CREATE TRIGGER recalc_positions_after_update
  AFTER UPDATE OF status ON public.queue_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_recalculate_positions();

-- Trigger de auth (SÓ depois que profiles existe)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_history ENABLE ROW LEVEL SECURITY;

-- Funções RLS (evitam recursão infinita em policies)
CREATE OR REPLACE FUNCTION public.is_motorista()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'motorista');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('empilhador', 'operador', 'supervisor', 'administrador'));
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('supervisor', 'administrador'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'administrador');
$$;

GRANT EXECUTE ON FUNCTION public.is_motorista() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Geofence readable by all" ON public.settings
  FOR SELECT USING (key = 'geofence');

CREATE POLICY "Settings readable by staff" ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_supervisor_or_admin());

CREATE POLICY "Settings writable by admin" ON public.settings
  FOR ALL TO authenticated
  USING (public.is_supervisor_or_admin())
  WITH CHECK (public.is_supervisor_or_admin());

CREATE POLICY "Public check-in insert" ON public.queue_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read by token" ON public.queue_entries
  FOR SELECT USING (true);

CREATE POLICY "Staff update queue" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "History readable" ON public.queue_history
  FOR SELECT USING (true);

CREATE POLICY "Staff insert history notes" ON public.queue_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

-- Confirma
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'settings', 'queue_entries', 'queue_history')
ORDER BY tablename;
