-- JTIs de proof de cliente (uso único / multi-instância)

CREATE TABLE IF NOT EXISTS public.client_proof_jtis (
  jti UUID PRIMARY KEY,
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS client_proof_jtis_shop_phone_idx
  ON public.client_proof_jtis (barbershop_id, phone);

ALTER TABLE public.client_proof_jtis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_proof_jtis_tenant ON public.client_proof_jtis;
CREATE POLICY client_proof_jtis_tenant ON public.client_proof_jtis
  FOR ALL USING (
    barbershop_id = public.user_barbershop_id()
  )
  WITH CHECK (
    barbershop_id = public.user_barbershop_id()
  );
