-- FilaDock — contas operacionais de produção (1 admin + 1 empilhador)
-- Idempotente. Não remove motoristas nem dados da fila.
--
-- ANTES: crie os usuários em Supabase → Authentication → Users
--        (Auto Confirm User) com senhas FORTES — só vocês sabem.
--        Sugestão de e-mails corporativos reais, ex.:
--          admin@lsl.com  ·  empilhador@lsl.com
--        (ou e-mails pessoais/corporativos da equipe)

-- ========== 1. Garantir perfil ADMINISTRADOR ==========
INSERT INTO public.profiles (id, email, full_name, role)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', 'Administrador LSL'), 'administrador'::public.user_role
FROM auth.users u
WHERE lower(u.email) = lower('admin@lsl.com')  -- troque pelo e-mail real do admin
ON CONFLICT (id) DO UPDATE SET
  role = 'administrador'::public.user_role,
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

-- ========== 2. Garantir perfil EMPILHADOR ==========
INSERT INTO public.profiles (id, email, full_name, role)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', 'Empilhador LSL'), 'empilhador'::public.user_role
FROM auth.users u
WHERE lower(u.email) = lower('empilhador@lsl.com')  -- troque pelo e-mail real do empilhador
ON CONFLICT (id) DO UPDATE SET
  role = 'empilhador'::public.user_role,
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

-- ========== 3. Conferência ==========
SELECT email, role, full_name
FROM public.profiles
WHERE role IN ('administrador', 'empilhador')
ORDER BY role;

-- Esperado: pelo menos 1 linha administrador + 1 linha empilhador.
-- Login staff: https://fila-lsl.vercel.app/login
