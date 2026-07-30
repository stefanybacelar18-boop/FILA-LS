-- Check-in remoto (Belém) + chegada no PAD
-- Status: em_viagem → aguardando_descarregamento na chegada

ALTER TYPE public.queue_status ADD VALUE IF NOT EXISTS 'em_viagem';

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS chegada_pad_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chegada_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS chegada_lng DOUBLE PRECISION;

-- Posição na fila: só quem aguarda descarregamento (em_viagem fica fora)
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
