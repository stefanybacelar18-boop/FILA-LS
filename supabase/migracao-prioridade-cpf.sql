-- Evolução: prioridade na fila + CPF opcional no check-in
-- Rode após setup-completo.sql e migracao-status-simplificado.sql

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS prioridade BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.queue_entries
  ALTER COLUMN cpf DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.recalculate_queue_positions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (
        ORDER BY prioridade DESC, created_at ASC
      ) AS pos
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
