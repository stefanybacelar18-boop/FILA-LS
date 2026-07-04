-- FilaDock — Correções RLS e trigger (nova aba SQL Editor)
-- Rode DEPOIS de evolucao-v1-parte1 e parte2
-- Se der "infinite recursion" em profiles, rode também: fix-rls-recursion.sql

-- Funções anti-recursão (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_motorista()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'motorista');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND role IN ('empilhador', 'operador', 'supervisor', 'administrador'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'administrador');
$$;

GRANT EXECUTE ON FUNCTION public.is_motorista() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Trigger de histórico roda com privilégios elevados (empilhador não bloqueia update)
CREATE OR REPLACE FUNCTION public.log_queue_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Empilhador pode inserir histórico manual se necessário
DROP POLICY IF EXISTS "Staff insert history notes" ON public.queue_history;
CREATE POLICY "Staff insert history notes" ON public.queue_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

-- Check-in só via motorista autenticado (API)
DROP POLICY IF EXISTS "Public check-in insert" ON public.queue_entries;
CREATE POLICY "Motorista check-in insert" ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_motorista());

-- Realtime no histórico
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Empilhador pode atualizar fila
DROP POLICY IF EXISTS "Staff update queue" ON public.queue_entries;
CREATE POLICY "Staff update queue" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Leitura pública restrita: apenas via função por token (LGPD)
DROP POLICY IF EXISTS "Public read by token" ON public.queue_entries;

CREATE OR REPLACE FUNCTION public.get_queue_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  token text,
  minuta text,
  placa text,
  placa_cavalo text,
  status public.queue_status,
  doca text,
  previsao_descarregamento timestamptz,
  posicao_fila integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id, q.token, q.minuta, q.placa, q.placa_cavalo, q.status,
    q.doca, q.previsao_descarregamento, q.posicao_fila, q.created_at
  FROM public.queue_entries q
  WHERE q.token = p_token AND q.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_active_queue_summary()
RETURNS TABLE (
  id uuid,
  token text,
  minuta text,
  placa text,
  placa_cavalo text,
  status public.queue_status,
  doca text,
  previsao_descarregamento timestamptz,
  posicao_fila integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id, q.token, q.minuta, q.placa, q.placa_cavalo, q.status,
    q.doca, q.previsao_descarregamento, q.posicao_fila, q.created_at
  FROM public.queue_entries q
  WHERE q.deleted_at IS NULL
    AND q.status IN (
      'aguardando', 'chamado', 'em_deslocamento', 'em_descarga',
      'aguardando_carregamento_racks'
    )
    AND q.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Manaus');
$$;

GRANT EXECUTE ON FUNCTION public.get_queue_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_queue_summary() TO anon, authenticated;

-- Staff e motorista leem fila completa
DROP POLICY IF EXISTS "Staff read queue" ON public.queue_entries;
CREATE POLICY "Staff read queue" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Motorista read own queue" ON public.queue_entries;
CREATE POLICY "Motorista read own queue" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid());

SELECT 'Correções RLS aplicadas!' AS status;
