-- Web Push para motorista (notificacao com app fechado)
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.driver_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time bigint NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_push_subscriptions_unique_endpoint
  ON public.driver_push_subscriptions (driver_user_id, endpoint)
  WHERE deleted_at IS NULL;

ALTER TABLE public.driver_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_push_subscriptions_select_own" ON public.driver_push_subscriptions;
CREATE POLICY "driver_push_subscriptions_select_own"
  ON public.driver_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = driver_user_id);

DROP POLICY IF EXISTS "driver_push_subscriptions_insert_own" ON public.driver_push_subscriptions;
CREATE POLICY "driver_push_subscriptions_insert_own"
  ON public.driver_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_user_id);

DROP POLICY IF EXISTS "driver_push_subscriptions_update_own" ON public.driver_push_subscriptions;
CREATE POLICY "driver_push_subscriptions_update_own"
  ON public.driver_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = driver_user_id)
  WITH CHECK (auth.uid() = driver_user_id);

DROP POLICY IF EXISTS "driver_push_subscriptions_delete_own" ON public.driver_push_subscriptions;
CREATE POLICY "driver_push_subscriptions_delete_own"
  ON public.driver_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = driver_user_id);

CREATE OR REPLACE FUNCTION public.set_driver_push_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_push_subscriptions_updated_at ON public.driver_push_subscriptions;
CREATE TRIGGER trg_driver_push_subscriptions_updated_at
  BEFORE UPDATE ON public.driver_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_driver_push_subscriptions_updated_at();

SELECT 'migracao-web-push-motorista aplicada' AS status;
