-- Fase 1.B.3-G — Gateway isolado (payment_intents + webhook + quarantine).
-- Local/CI only. Produção continua json. Sem efeito de negócio (sales/deposits).
-- D7 / D12 / P16. deposit_id SEM FK até 1.B.7.

-- ═══════════════════════════════════════════════════════════════════════════
-- appointments: UNIQUE (id, barbershop_id) para FK composta
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'appointments'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'appointments_id_barbershop_uidx'
    ) THEN
      ALTER TABLE public.appointments
        ADD CONSTRAINT appointments_id_barbershop_uidx UNIQUE (id, barbershop_id);
    END IF;
  END IF;
END $$;

-- sales UNIQUE já pode existir (1.B.2); garantir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_id_barbershop_uidx'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_id_barbershop_uidx UNIQUE (id, barbershop_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- payment_provider_accounts (sem segredos — D12)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, provider)
);

COMMENT ON TABLE public.payment_provider_accounts IS
  'Conta conectada por barbearia (D12). Sem credenciais nesta etapa.';

-- ═══════════════════════════════════════════════════════════════════════════
-- payment_intents
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('pix', 'credit', 'debit')),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'canceled')),
  purpose TEXT NOT NULL
    CHECK (purpose IN ('sale', 'deposit', 'appointment', 'other')),
  appointment_id UUID NULL,
  sale_id UUID NULL,
  deposit_id UUID NULL, -- FK adiada: deposits é 1.B.7
  applied_at TIMESTAMPTZ NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, barbershop_id),
  UNIQUE (provider, provider_ref),
  UNIQUE (barbershop_id, idempotency_key)
);

COMMENT ON COLUMN public.payment_intents.deposit_id IS
  'Pendência 1.B.7: FK composta → deposits(id, barbershop_id).';
COMMENT ON COLUMN public.payment_intents.status IS
  'paid/canceled são TERMINAIS — eventos fora de ordem não regridem.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'appointments'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_appointment_tenant_fkey'
  ) THEN
    ALTER TABLE public.payment_intents
      ADD CONSTRAINT payment_intents_appointment_tenant_fkey
      FOREIGN KEY (appointment_id, barbershop_id)
      REFERENCES public.appointments (id, barbershop_id)
      ON DELETE RESTRICT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_sale_tenant_fkey'
  ) THEN
    ALTER TABLE public.payment_intents
      ADD CONSTRAINT payment_intents_sale_tenant_fkey
      FOREIGN KEY (sale_id, barbershop_id)
      REFERENCES public.sales (id, barbershop_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payment_intents_barbershop_idx
  ON public.payment_intents (barbershop_id);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx
  ON public.payment_intents (barbershop_id, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- payment_webhook_events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL,
  payment_intent_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'duplicate')),
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  FOREIGN KEY (payment_intent_id, barbershop_id)
    REFERENCES public.payment_intents (id, barbershop_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_intent_idx
  ON public.payment_webhook_events (barbershop_id, payment_intent_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- payment_webhook_quarantine (P16)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_webhook_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT,
  provider_event_id TEXT,
  raw_payload JSONB NOT NULL,
  error_reason TEXT NOT NULL,
  signature_valid BOOLEAN,
  attempts INT NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at TIMESTAMPTZ NULL,
  reprocess_result TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_quarantine_provider_event_uidx
  ON public.payment_webhook_quarantine (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

COMMENT ON TABLE public.payment_webhook_quarantine IS
  'P16: UNIQUE parcial (provider, provider_event_id); repetição → attempts++.';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS + grants
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_quarantine FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.payment_intents FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_provider_accounts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_webhook_events FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_webhook_quarantine FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.payment_intents FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_provider_accounts FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_webhook_events FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.payment_webhook_quarantine FROM authenticated';
    -- authenticated: só SELECT nas intents do próprio tenant
    EXECUTE 'GRANT SELECT ON TABLE public.payment_intents TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON TABLE public.payment_intents TO service_role';
    EXECUTE 'GRANT ALL ON TABLE public.payment_provider_accounts TO service_role';
    EXECUTE 'GRANT ALL ON TABLE public.payment_webhook_events TO service_role';
    EXECUTE 'GRANT ALL ON TABLE public.payment_webhook_quarantine TO service_role';
  END IF;
END $$;

DROP POLICY IF EXISTS payment_intents_tenant_select ON public.payment_intents;
CREATE POLICY payment_intents_tenant_select ON public.payment_intents
  FOR SELECT TO authenticated
  USING (barbershop_id = public.user_barbershop_id());

-- events/quarantine/accounts: sem policy para authenticated → sem acesso
DROP POLICY IF EXISTS payment_webhook_events_deny ON public.payment_webhook_events;
DROP POLICY IF EXISTS payment_webhook_quarantine_deny ON public.payment_webhook_quarantine;
DROP POLICY IF EXISTS payment_provider_accounts_deny ON public.payment_provider_accounts;

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper: upsert quarentena (attempts++)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_quarantine_payment_webhook(
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_raw_payload JSONB,
  p_error_reason TEXT,
  p_signature_valid BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  quarantine_id UUID,
  attempts INT,
  error_reason TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_attempts INT;
BEGIN
  IF p_provider_event_id IS NOT NULL THEN
    INSERT INTO public.payment_webhook_quarantine AS q (
      provider, provider_event_id, raw_payload, error_reason, signature_valid
    ) VALUES (
      p_provider, p_provider_event_id, p_raw_payload, p_error_reason, p_signature_valid
    )
    ON CONFLICT (provider, provider_event_id) WHERE (provider_event_id IS NOT NULL)
    DO UPDATE SET
      attempts = q.attempts + 1,
      last_seen_at = now(),
      raw_payload = EXCLUDED.raw_payload,
      error_reason = EXCLUDED.error_reason,
      signature_valid = COALESCE(EXCLUDED.signature_valid, q.signature_valid)
    RETURNING q.id, q.attempts INTO v_id, v_attempts;
  ELSE
    INSERT INTO public.payment_webhook_quarantine (
      provider, provider_event_id, raw_payload, error_reason, signature_valid
    ) VALUES (
      p_provider, NULL, p_raw_payload, p_error_reason, p_signature_valid
    )
    RETURNING id, payment_webhook_quarantine.attempts INTO v_id, v_attempts;
  END IF;

  quarantine_id := v_id;
  attempts := v_attempts;
  error_reason := p_error_reason;
  RETURN NEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ops_apply_payment_webhook — passos 4–6 numa TX (sem efeito de negócio)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_apply_payment_webhook(
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_provider_ref TEXT,
  p_event_status TEXT,
  p_amount NUMERIC,
  p_raw_payload JSONB,
  p_signature_valid BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  result TEXT,
  intent_id UUID,
  barbershop_id UUID,
  intent_status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_intent public.payment_intents%ROWTYPE;
  v_new_status TEXT;
  v_inserted BOOLEAN := FALSE;
BEGIN
  IF p_provider IS NULL OR p_provider_event_id IS NULL OR p_provider_ref IS NULL THEN
    RAISE EXCEPTION 'SCHEMA_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_event_status NOT IN ('pending', 'paid', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'SCHEMA_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_intent
  FROM public.payment_intents pi
  WHERE pi.provider = p_provider AND pi.provider_ref = p_provider_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.ops_quarantine_payment_webhook(
      p_provider, p_provider_event_id, p_raw_payload, 'intent_missing', p_signature_valid
    );
    result := 'quarantined_intent_missing';
    intent_id := NULL;
    barbershop_id := NULL;
    intent_status := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- amount mismatch → quarentena; intent inalterada
  IF p_amount IS DISTINCT FROM v_intent.amount THEN
    PERFORM public.ops_quarantine_payment_webhook(
      p_provider, p_provider_event_id, p_raw_payload, 'amount_mismatch', p_signature_valid
    );
    result := 'quarantined_amount_mismatch';
    intent_id := v_intent.id;
    barbershop_id := v_intent.barbershop_id;
    intent_status := v_intent.status;
    RETURN NEXT;
    RETURN;
  END IF;

  -- (4) INSERT event; duplicate → no-op
  BEGIN
    INSERT INTO public.payment_webhook_events (
      barbershop_id, payment_intent_id, provider, provider_event_id,
      signature_valid, status, raw_payload
    ) VALUES (
      v_intent.barbershop_id, v_intent.id, p_provider, p_provider_event_id,
      p_signature_valid, 'processed', p_raw_payload
    );
    v_inserted := TRUE;
  EXCEPTION WHEN unique_violation THEN
    result := 'duplicate';
    intent_id := v_intent.id;
    barbershop_id := v_intent.barbershop_id;
    intent_status := v_intent.status;
    RETURN NEXT;
    RETURN;
  END;

  -- (5) atualizar status respeitando terminais / fora de ordem
  v_new_status := v_intent.status;
  IF v_intent.status IN ('paid', 'canceled') THEN
    -- terminal: não regride
    v_new_status := v_intent.status;
  ELSIF v_intent.status = 'pending' AND p_event_status IN ('paid', 'failed', 'canceled') THEN
    v_new_status := p_event_status;
  ELSIF v_intent.status = 'failed' AND p_event_status = 'paid' THEN
    v_new_status := 'paid';
  ELSIF v_intent.status = 'failed' AND p_event_status = 'canceled' THEN
    v_new_status := 'canceled';
  END IF;
  -- pending event never regresses paid/canceled/failed

  IF v_new_status IS DISTINCT FROM v_intent.status THEN
    UPDATE public.payment_intents pi
    SET
      status = v_new_status,
      updated_at = now(),
      applied_at = CASE
        WHEN v_new_status = 'paid' THEN COALESCE(pi.applied_at, now())
        ELSE pi.applied_at
      END
    WHERE pi.id = v_intent.id AND pi.barbershop_id = v_intent.barbershop_id;
  END IF;

  -- (6) efeito de negócio: NENHUM nesta etapa (modo isolado)

  result := CASE WHEN v_inserted THEN 'processed' ELSE 'duplicate' END;
  intent_id := v_intent.id;
  barbershop_id := v_intent.barbershop_id;
  intent_status := v_new_status;
  RETURN NEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reprocessamento de quarentena (service role), idempotente
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ops_reprocess_payment_quarantine(
  p_quarantine_id UUID
)
RETURNS TABLE (
  result TEXT,
  quarantine_id UUID,
  intent_id UUID,
  intent_status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q public.payment_webhook_quarantine%ROWTYPE;
  v_provider TEXT;
  v_event_id TEXT;
  v_ref TEXT;
  v_status TEXT;
  v_amount NUMERIC;
  v_apply RECORD;
  v_existing UUID;
BEGIN
  SELECT * INTO v_q
  FROM public.payment_webhook_quarantine q
  WHERE q.id = p_quarantine_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUARANTINE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  v_provider := COALESCE(v_q.provider, v_q.raw_payload->>'provider');
  v_event_id := COALESCE(v_q.provider_event_id, v_q.raw_payload->>'provider_event_id');
  v_ref := v_q.raw_payload->>'provider_ref';
  v_status := v_q.raw_payload->>'status';
  BEGIN
    v_amount := (v_q.raw_payload->>'amount')::numeric;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.payment_webhook_quarantine
    SET reprocessed_at = now(), reprocess_result = 'still_invalid_schema'
    WHERE id = v_q.id;
    result := 'still_invalid';
    quarantine_id := v_q.id;
    intent_id := NULL;
    intent_status := NULL;
    RETURN NEXT;
    RETURN;
  END;

  IF v_provider IS NULL OR v_event_id IS NULL OR v_ref IS NULL OR v_status IS NULL THEN
    UPDATE public.payment_webhook_quarantine
    SET reprocessed_at = now(), reprocess_result = 'still_invalid_schema'
    WHERE id = v_q.id;
    result := 'still_invalid';
    quarantine_id := v_q.id;
    intent_id := NULL;
    intent_status := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Já processado → só metadados
  SELECT e.id INTO v_existing
  FROM public.payment_webhook_events e
  WHERE e.provider = v_provider AND e.provider_event_id = v_event_id;
  IF v_existing IS NOT NULL THEN
    UPDATE public.payment_webhook_quarantine
    SET reprocessed_at = now(), reprocess_result = 'already_processed'
    WHERE id = v_q.id;
    result := 'already_processed';
    quarantine_id := v_q.id;
    intent_id := NULL;
    intent_status := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_apply
  FROM public.ops_apply_payment_webhook(
    v_provider, v_event_id, v_ref, v_status, v_amount, v_q.raw_payload, COALESCE(v_q.signature_valid, TRUE)
  );

  IF v_apply.result LIKE 'quarantined%' THEN
    UPDATE public.payment_webhook_quarantine
    SET reprocessed_at = now(), reprocess_result = v_apply.result
    WHERE id = v_q.id;
    result := v_apply.result;
  ELSE
    UPDATE public.payment_webhook_quarantine
    SET reprocessed_at = now(), reprocess_result = v_apply.result
    WHERE id = v_q.id;
    result := v_apply.result;
  END IF;

  quarantine_id := v_q.id;
  intent_id := v_apply.intent_id;
  intent_status := v_apply.intent_status;
  RETURN NEXT;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ops_quarantine_payment_webhook(text,text,jsonb,text,boolean)',
    'ops_apply_payment_webhook(text,text,text,text,numeric,jsonb,boolean)',
    'ops_reprocess_payment_quarantine(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END IF;
  END LOOP;
END $$;
