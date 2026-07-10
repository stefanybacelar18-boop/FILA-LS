-- FilaDock — integração Google Form (Respostas FORM VIG)
-- Vincula cada linha da planilha a um registro na fila (evita duplicata na sync).

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS google_form_row_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_google_form_row_id
  ON public.queue_entries (google_form_row_id)
  WHERE google_form_row_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.queue_entries.google_form_row_id IS
  'Chave estável da linha na planilha de respostas do Google Form (carimbo|placa).';
