-- ============================================================
-- FilaDock — Tornar usuário administrador
-- Rode DEPOIS de criar o usuário em Authentication → Users
--
-- Troque o e-mail abaixo pelo seu:
-- ============================================================

UPDATE public.profiles
SET role = 'administrador'
WHERE email = 'admin@lsl.com';

-- Se o perfil não existir (cria manualmente):
INSERT INTO public.profiles (id, email, full_name, role)
SELECT id, email, email, 'administrador'::public.user_role
FROM auth.users
WHERE email = 'admin@lsl.com'
ON CONFLICT (id) DO UPDATE SET role = 'administrador';

-- Confirma
SELECT email, role FROM public.profiles WHERE email = 'admin@lsl.com';
