-- Garantir perfil do operador@lsl.com
-- IMPORTANTE: o usuário precisa existir em Supabase → Authentication → Users
-- E-mail: operador@lsl.com | Senha: Operador@2024 | Auto Confirm User

INSERT INTO public.profiles (id, email, full_name, role)
SELECT u.id, u.email, 'Operador LSL', 'operador'::public.user_role
FROM auth.users u
WHERE u.email = 'operador@lsl.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'operador'::public.user_role,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email;

-- Verificar se o usuário existe no Auth
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'operador@lsl.com')
    THEN 'OK — operador@lsl.com existe no Auth'
    ELSE 'FALTA — crie operador@lsl.com em Authentication → Users (Auto Confirm)'
  END AS status_auth;

SELECT email, role, full_name FROM public.profiles WHERE email = 'operador@lsl.com';
