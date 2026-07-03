-- ============================================================
-- PARTE 1 — Rode PRIMEIRO (sozinha, nova aba, clique Run)
-- PostgreSQL exige commit separado antes de usar novos ENUMs
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'empilhador';

ALTER TYPE public.queue_status ADD VALUE IF NOT EXISTS 'aguardando_carregamento_racks';

SELECT 'Enums criados! Agora rode evolucao-v1-parte2.sql' AS proximo_passo;
