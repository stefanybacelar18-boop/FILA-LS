-- ============================================================
-- PARTE 2 — Rode DEPOIS da parte 1 (nova aba)
-- NÃO inclui ALTER TYPE (já feito na parte 1)
-- ============================================================

-- Perfis: dados do motorista + liberação admin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS checkin_liberado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf) WHERE cpf IS NOT NULL;

-- queue_entries: novos campos
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS driver_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS minuta TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT DEFAULT 'convencional';
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS placa_cavalo TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS placa_carreta TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS placa_segunda_carreta TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS retorno_racks_vazios BOOLEAN;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.queue_entries SET placa_cavalo = placa WHERE placa_cavalo IS NULL AND placa IS NOT NULL;

ALTER TABLE public.queue_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.checkin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_user_id UUID REFERENCES auth.users(id),
  queue_entry_id UUID REFERENCES public.queue_entries(id),
  action TEXT NOT NULL,
  device_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.settings
SET value = jsonb_set(
  jsonb_set(value, '{radius_meters}', '100'),
  '{name}', '"LSL Transportes da Amazônia - Pátio"'
)
WHERE key = 'geofence';

INSERT INTO public.settings (key, value) VALUES
  ('operacional', '{"checkin_cooldown_dias": 6, "mensagem_fora_patio": "Você ainda não está no pátio da empresa. Aproxime-se da empresa para realizar o check-in."}'),
  ('mensagens', '{"whatsapp_chamada": "LSL Transportes da Amazônia\\n\\nMotorista da minuta {MINUTA},\\n\\nFavor dirigir-se imediatamente para a doca {DOCA} para início da operação.\\n\\nObrigado."}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.checkin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read audit log" ON public.checkin_audit_log;
CREATE POLICY "Staff read audit log" ON public.checkin_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('operador', 'supervisor', 'administrador')
  ));

DROP POLICY IF EXISTS "Authenticated insert audit" ON public.checkin_audit_log;
CREATE POLICY "Authenticated insert audit" ON public.checkin_audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_user_id);

DROP POLICY IF EXISTS "Driver read own entries" ON public.queue_entries;
CREATE POLICY "Driver read own entries" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid());

DROP POLICY IF EXISTS "Empilhador update queue" ON public.queue_entries;
CREATE POLICY "Empilhador update queue" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('empilhador', 'operador', 'supervisor', 'administrador')
  ));

SELECT 'Evolução v1 aplicada!' AS status;
