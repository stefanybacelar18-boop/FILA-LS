-- Fase 0: preparação Auth + revogação + isolamento multi-tenant

-- Revogação de sessões staff (bridge até Supabase Auth JWT deny-list)
CREATE TABLE IF NOT EXISTS public.staff_session_revocations (
  staff_id UUID PRIMARY KEY,
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  actor_id UUID,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permission_audit_shop_idx
  ON public.permission_audit_log (barbershop_id, created_at DESC);

-- Client OTP proofs (opcional persistência multi-instância)
CREATE TABLE IF NOT EXISTS public.client_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_otp_shop_phone_idx
  ON public.client_otp_challenges (barbershop_id, phone);

ALTER TABLE public.staff_session_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_otp_challenges ENABLE ROW LEVEL SECURITY;

-- Políticas: apenas service role / funções com user_barbershop_id()
DROP POLICY IF EXISTS staff_revocations_tenant ON public.staff_session_revocations;
CREATE POLICY staff_revocations_tenant ON public.staff_session_revocations
  FOR ALL USING (
    barbershop_id = public.user_barbershop_id()
  )
  WITH CHECK (
    barbershop_id = public.user_barbershop_id()
  );

DROP POLICY IF EXISTS permission_audit_tenant ON public.permission_audit_log;
CREATE POLICY permission_audit_tenant ON public.permission_audit_log
  FOR ALL USING (
    barbershop_id = public.user_barbershop_id()
  )
  WITH CHECK (
    barbershop_id = public.user_barbershop_id()
  );

DROP POLICY IF EXISTS client_otp_tenant ON public.client_otp_challenges;
CREATE POLICY client_otp_tenant ON public.client_otp_challenges
  FOR ALL USING (
    barbershop_id = public.user_barbershop_id()
  )
  WITH CHECK (
    barbershop_id = public.user_barbershop_id()
  );
