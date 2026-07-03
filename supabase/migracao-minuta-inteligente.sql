-- FILA LSL — Metadados de minuta (import Excel) + expedição diária
-- Rode no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.minuta_metadata (
  minuta TEXT PRIMARY KEY,
  volume_motos INTEGER NOT NULL DEFAULT 0 CHECK (volume_motos >= 0),
  menor_vencimento DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minuta_metadata_vencimento
  ON public.minuta_metadata (menor_vencimento)
  WHERE menor_vencimento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_minuta_metadata_imported
  ON public.minuta_metadata (imported_at DESC);

ALTER TABLE public.minuta_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read minuta_metadata" ON public.minuta_metadata;
CREATE POLICY "Staff read minuta_metadata"
  ON public.minuta_metadata FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('administrador', 'empilhador', 'operador', 'supervisor')
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Admin manage minuta_metadata" ON public.minuta_metadata;
CREATE POLICY "Admin manage minuta_metadata"
  ON public.minuta_metadata FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'administrador'
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'administrador'
        AND p.deleted_at IS NULL
    )
  );

-- Chave settings: expedicao_diaria → { "motos": 500, "updated_at": "..." }

SELECT 'minuta_metadata OK' AS status;
