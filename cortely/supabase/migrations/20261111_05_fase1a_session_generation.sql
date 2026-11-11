-- Fase 1.A — session_generation para revogação independente da precisão do JWT iat

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS session_generation INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.profiles.session_generation IS
  'Incrementado em revoke/role-change/deactivate. Cookie cortely_sg deve coincidir.';
