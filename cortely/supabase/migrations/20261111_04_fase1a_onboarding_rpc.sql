-- Fase 1.A — provisionamento atômico do owner + barbearia (pós-confirmação de e-mail)
-- Chamada preferencial via service_role com p_user_id validado pela API.

CREATE OR REPLACE FUNCTION public.provision_owner_barbershop(
  p_user_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_shop_name TEXT,
  p_shop_slug TEXT,
  p_shop_phone TEXT
)
RETURNS TABLE (
  barbershop_id UUID,
  profile_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed TIMESTAMPTZ;
  v_shop_id UUID;
  v_existing_status TEXT;
  v_existing_shop UUID;
  v_slug TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id obrigatório';
  END IF;

  IF length(trim(p_shop_name)) < 2 OR length(trim(p_shop_slug)) < 2 THEN
    RAISE EXCEPTION 'nome/slug inválidos';
  END IF;

  v_slug := lower(trim(p_shop_slug));

  SELECT u.email_confirmed_at
    INTO v_confirmed
  FROM auth.users AS u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuário auth inexistente';
  END IF;

  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'e-mail não confirmado';
  END IF;

  SELECT p.provisioning_status, p.barbershop_id
    INTO v_existing_status, v_existing_shop
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_existing_status = 'ready' AND v_existing_shop IS NOT NULL THEN
    barbershop_id := v_existing_shop;
    profile_id := p_user_id;
    status := 'ready';
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.barbershops AS b WHERE b.slug = v_slug
  ) AND (v_existing_shop IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.barbershops AS b
    WHERE b.id = v_existing_shop AND b.slug = v_slug
  )) THEN
    RAISE EXCEPTION 'slug já em uso' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.profiles
  SET provisioning_status = 'provisioning',
      full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
      email = lower(trim(p_email)),
      is_active = FALSE
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      id, full_name, email, role, barbershop_id,
      is_active, provisioning_status
    ) VALUES (
      p_user_id,
      trim(p_full_name),
      lower(trim(p_email)),
      'owner',
      NULL,
      FALSE,
      'provisioning'
    );
  END IF;

  IF v_existing_shop IS NULL THEN
    INSERT INTO public.barbershops (name, slug, phone)
    VALUES (trim(p_shop_name), v_slug, trim(p_shop_phone))
    RETURNING id INTO v_shop_id;
  ELSE
    v_shop_id := v_existing_shop;
    UPDATE public.barbershops
    SET name = trim(p_shop_name),
        phone = trim(p_shop_phone)
    WHERE id = v_shop_id;
  END IF;

  UPDATE public.profiles
  SET barbershop_id = v_shop_id,
      role = 'owner',
      is_active = TRUE,
      provisioning_status = 'ready'
  WHERE id = p_user_id;

  barbershop_id := v_shop_id;
  profile_id := p_user_id;
  status := 'ready';
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.provision_owner_barbershop(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.provision_owner_barbershop(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_owner_barbershop(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.provision_owner_barbershop(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM authenticated;
-- Apenas service_role (API Next.js após validar JWT + e-mail confirmado)
GRANT EXECUTE ON FUNCTION public.provision_owner_barbershop(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
