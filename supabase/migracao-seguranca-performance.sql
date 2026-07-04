-- FilaDock — segurança RLS + índices de performance
-- Rode no SQL Editor (nova aba) após setup/evolução.

-- ========== SEGURANÇA ==========

DROP POLICY IF EXISTS "Public read by token" ON public.queue_entries;
DROP POLICY IF EXISTS "Public check-in insert" ON public.queue_entries;

DROP POLICY IF EXISTS "History readable" ON public.queue_history;
CREATE POLICY "Staff read history" ON public.queue_history
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Se is_staff() não existir, rode evolucao-v1-parte3-fixes.sql primeiro.

-- ========== ÍNDICES ==========

CREATE INDEX IF NOT EXISTS idx_queue_entries_driver_user_id
  ON public.queue_entries (driver_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_placa_cavalo
  ON public.queue_entries (placa_cavalo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_today
  ON public.queue_entries (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_status_active
  ON public.queue_entries (status, created_at)
  WHERE deleted_at IS NULL;

-- Backfill único de finished_at (não fazer no GET da API)
UPDATE public.queue_entries q
SET finished_at = q.updated_at
WHERE q.finished_at IS NULL
  AND q.status IN ('finalizado', 'ausente');

SELECT 'Segurança e índices OK' AS status;
