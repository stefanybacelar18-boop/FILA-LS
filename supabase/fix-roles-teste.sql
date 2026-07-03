-- Corrige trigger + perfis de teste (@lsl.com)
-- Rode após setup-completo.sql e depois de criar usuários no Auth

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.user_role;
BEGIN
  assigned_role := CASE lower(NEW.email)
    WHEN 'motorista@lsl.com' THEN 'motorista'::public.user_role
    WHEN 'empilhador@lsl.com' THEN 'empilhador'::public.user_role
    WHEN 'admin@lsl.com' THEN 'administrador'::public.user_role
    ELSE COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.user_role,
      'motorista'::public.user_role
    )
  END;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name;

  RETURN NEW;
END;
$$;

UPDATE public.profiles SET role = 'motorista'::public.user_role, full_name = 'Motorista Teste LSL'
WHERE lower(email) = 'motorista@lsl.com';

UPDATE public.profiles SET role = 'empilhador'::public.user_role, full_name = 'Empilhador LSL'
WHERE lower(email) = 'empilhador@lsl.com';

UPDATE public.profiles SET role = 'administrador'::public.user_role, full_name = 'Administrador LSL'
WHERE lower(email) = 'admin@lsl.com';

-- Legado: operador/supervisor viram empilhador
UPDATE public.profiles SET role = 'empilhador'::public.user_role
WHERE role IN ('operador'::public.user_role, 'supervisor'::public.user_role);

SELECT email, role, full_name FROM public.profiles
WHERE lower(email) IN (
  'motorista@lsl.com', 'empilhador@lsl.com', 'admin@lsl.com'
)
ORDER BY email;
