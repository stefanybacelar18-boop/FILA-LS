-- Usuários fixos LSL — motorista, empilhador, admin (sem operador)
-- 1) Crie os usuários em Authentication → Users (Auto Confirm User)
--    motorista@lsl.com   / Motorista@2024
--    empilhador@lsl.com  / Empilhador@2024
--    admin@lsl.com       / Admin@2024
-- 2) Rode este SQL

INSERT INTO public.profiles (id, email, full_name, role)
SELECT u.id, u.email,
  CASE u.email
    WHEN 'motorista@lsl.com' THEN 'Motorista Teste LSL'
    WHEN 'empilhador@lsl.com' THEN 'Empilhador LSL'
    WHEN 'admin@lsl.com' THEN 'Administrador LSL'
    ELSE u.email
  END,
  CASE u.email
    WHEN 'motorista@lsl.com' THEN 'motorista'::public.user_role
    WHEN 'empilhador@lsl.com' THEN 'empilhador'::public.user_role
    WHEN 'admin@lsl.com' THEN 'administrador'::public.user_role
    ELSE 'motorista'::public.user_role
  END
FROM auth.users u
WHERE u.email IN (
  'motorista@lsl.com',
  'empilhador@lsl.com',
  'admin@lsl.com'
)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email;

-- Perfis legados operador/supervisor → empilhador
UPDATE public.profiles
SET role = 'empilhador'::public.user_role
WHERE role IN ('operador'::public.user_role, 'supervisor'::public.user_role);

SELECT email, role, full_name FROM public.profiles
WHERE email IN (
  'motorista@lsl.com',
  'empilhador@lsl.com',
  'admin@lsl.com'
)
ORDER BY email;
