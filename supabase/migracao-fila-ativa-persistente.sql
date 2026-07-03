-- Fila ativa persiste entre dias até finalizar/ausentar/cancelar
-- Rode no SQL Editor do Supabase

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
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_active_queue_summary() TO anon, authenticated;

SELECT 'RPC get_active_queue_summary — fila ativa sem corte de meia-noite' AS status;
