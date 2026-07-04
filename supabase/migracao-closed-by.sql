-- FilaDock — rastreio de quem encerrou a operação (empilhador/admin)
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_queue_entries_closed_by_user_id
  ON public.queue_entries (closed_by_user_id)
  WHERE closed_by_user_id IS NOT NULL;

SELECT 'Coluna closed_by_user_id OK' AS status;
