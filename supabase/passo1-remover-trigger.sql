-- PASSO 1 — Rode PRIMEIRO (nova aba no SQL Editor)
-- Remove o trigger que está bloqueando a criação de usuários

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

SELECT 'Trigger removido. Agora crie o usuário em Authentication → Users' AS proximo_passo;
