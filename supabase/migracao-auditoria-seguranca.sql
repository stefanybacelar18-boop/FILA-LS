-- Auditoria de segurança e performance (FilaDock)
-- Execute no SQL Editor do Supabase APÓS as migrations de produção existentes.
-- docs/SEGURANCA-PRODUCAO.md + este arquivo.

-- ---------------------------------------------------------------------------
-- 1. RPCs públicos: remover placas, token e restringir fila ativa
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_active_queue_summary();
DROP FUNCTION IF EXISTS public.get_queue_by_token(text);

CREATE OR REPLACE FUNCTION public.get_queue_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  token text,
  minuta text,
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
    q.id,
    q.token,
    q.minuta,
    q.status,
    q.doca,
    q.previsao_descarregamento,
    q.posicao_fila,
    q.created_at
  FROM public.queue_entries q
  WHERE q.token = p_token AND q.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_active_queue_summary()
RETURNS TABLE (
  id uuid,
  minuta text,
  status public.queue_status,
  doca text,
  previsao_descarregamento timestamptz,
  posicao_fila integer,
  prioridade boolean,
  called_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.minuta,
    q.status,
    q.doca,
    q.previsao_descarregamento,
    q.posicao_fila,
    COALESCE(q.prioridade, false),
    q.called_at,
    q.created_at
  FROM public.queue_entries q
  WHERE q.deleted_at IS NULL
    AND q.status IN (
      'aguardando_descarregamento',
      'aguardando',
      'chamado',
      'em_deslocamento',
      'em_descarga',
      'aguardando_carregamento_racks'
    );
$$;

REVOKE ALL ON FUNCTION public.get_queue_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_queue_by_token(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_active_queue_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_queue_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_queue_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Índices para consultas frequentes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_queue_entries_minuta_active
  ON public.queue_entries (minuta)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_finalizado_finished
  ON public.queue_entries (finished_at DESC)
  WHERE deleted_at IS NULL AND status = 'finalizado';

CREATE INDEX IF NOT EXISTS idx_checkin_audit_log_driver_created
  ON public.checkin_audit_log (driver_user_id, created_at DESC);

SELECT 'migracao-auditoria-seguranca aplicada' AS status;
