-- FilaDock — Cria perfis para TODOS os usuários auth sem profile
-- Rode no SQL Editor (nova aba). Resolve oi@oi.com e qualquer outro usuário órfão.

-- 1) Garantir trigger de criação automática para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'operador')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill: usuários existentes sem perfil
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  COALESCE((u.raw_user_meta_data->>'role')::public.user_role, 'operador'::public.user_role)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3) Forçar oi@oi.com como operador (se já existir, atualiza role)
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Operador'),
  'operador'::public.user_role
FROM auth.users u
WHERE u.email = 'oi@oi.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'operador'::public.user_role,
  email = EXCLUDED.email;

-- 4) Confirmação
SELECT u.email, p.role, p.full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.email;
