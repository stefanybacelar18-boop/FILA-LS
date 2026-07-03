-- Migração: status simplificados da fila
-- Novos status: aguardando_descarregamento | ausente | finalizado
-- Rode no SQL Editor do Supabase

ALTER TYPE public.queue_status ADD VALUE IF NOT EXISTS 'aguardando_descarregamento';

-- Converte registros antigos para o novo fluxo
UPDATE public.queue_entries
SET status = 'aguardando_descarregamento'::public.queue_status
WHERE status IN (
  'aguardando',
  'chamado',
  'em_deslocamento',
  'em_descarga',
  'aguardando_carregamento_racks'
);

-- Default do check-in
ALTER TABLE public.queue_entries
  ALTER COLUMN status SET DEFAULT 'aguardando_descarregamento';

-- Posição na fila: só quem aguarda descarregamento
CREATE OR REPLACE FUNCTION public.recalculate_queue_positions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS pos
    FROM public.queue_entries
    WHERE status = 'aguardando_descarregamento'
       OR status IN ('aguardando', 'chamado', 'em_deslocamento')
  )
  UPDATE public.queue_entries q
  SET posicao_fila = r.pos
  FROM ranked r WHERE q.id = r.id;

  UPDATE public.queue_entries
  SET posicao_fila = NULL
  WHERE status NOT IN ('aguardando_descarregamento', 'aguardando', 'chamado', 'em_deslocamento');
END;
$$;

SELECT public.recalculate_queue_positions();

-- Próximo passo: rode migracao-prioridade-cpf.sql e migracao-rpc-fila.sql

SELECT status, COUNT(*) AS total
FROM public.queue_entries
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;
