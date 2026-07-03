-- PASSO 3 — Rode DEPOIS do passo 2
-- Cria perfil para TODOS os usuários que ainda não têm profile
-- Troque o e-mail abaixo pelo seu, ou rode sem filtro para todos

INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  'administrador'::public.user_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- Confirma
SELECT id, email, role FROM public.profiles;
