-- FILA LSL — previsão + colunas + RPC da fila
-- Rode no SQL Editor do Supabase (nova aba).

-- Novos valores do enum (se ainda não existirem)
ALTER TYPE public.queue_status ADD VALUE IF NOT EXISTS 'aguardando_carregamento_racks';
ALTER TYPE public.queue_status ADD VALUE IF NOT EXISTS 'aguardando_descarregamento';

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS previsao_descarregamento TIMESTAMPTZ;

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS prioridade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;

ALTER TABLE public.queue_history
  ADD COLUMN IF NOT EXISTS previsao_descarregamento TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.get_active_queue_summary();

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
    q.token,
    q.minuta,
    q.placa,
    q.placa_cavalo,
    q.status,
    q.doca,
    q.previsao_descarregamento,
    q.posicao_fila,
    COALESCE(q.prioridade, false),
    q.called_at,
    q.created_at
  FROM public.queue_entries q
  WHERE q.deleted_at IS NULL
    AND q.status::text IN (
      'aguardando_descarregamento',
      'aguardando',
      'chamado',
      'em_deslocamento',
      'em_descarga',
      'aguardando_carregamento_racks'
    )
    AND q.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Manaus');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_queue_summary() TO anon, authenticated;

SELECT 'Coluna previsao_descarregamento OK' AS status;
