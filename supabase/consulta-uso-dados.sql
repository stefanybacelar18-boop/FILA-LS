-- FilaDock — diagnóstico de uso de dados
-- Rode no Supabase: SQL Editor → New query → Run

-- 1) Tamanho total do banco e das tabelas principais
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS banco_total,
  pg_size_pretty(pg_total_relation_size('public.queue_entries')) AS tabela_checkins,
  pg_size_pretty(pg_total_relation_size('public.queue_history')) AS tabela_historico,
  pg_size_pretty(pg_total_relation_size('public.minuta_metadata')) AS tabela_minutas,
  pg_size_pretty(pg_total_relation_size('public.profiles')) AS tabela_profiles,
  pg_size_pretty(pg_total_relation_size('public.settings')) AS tabela_settings;

-- 2) Contagem de registros (ativos = não excluídos por soft delete)
SELECT
  (SELECT COUNT(*) FROM public.queue_entries WHERE deleted_at IS NULL) AS checkins_total,
  (SELECT COUNT(*) FROM public.queue_entries WHERE deleted_at IS NULL AND status::text IN (
    'aguardando_descarregamento', 'aguardando', 'chamado', 'em_deslocamento',
    'em_descarga', 'aguardando_carregamento_racks'
  )) AS checkins_ativos_fila,
  (SELECT COUNT(*) FROM public.queue_entries WHERE deleted_at IS NULL AND status::text = 'finalizado') AS checkins_finalizados,
  (SELECT COUNT(*) FROM public.queue_entries WHERE deleted_at IS NULL AND status::text = 'ausente') AS checkins_ausentes,
  (SELECT COUNT(*) FROM public.queue_history WHERE deleted_at IS NULL) AS linhas_historico,
  (SELECT COUNT(*) FROM public.minuta_metadata) AS minutas_importadas,
  (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL) AS usuarios;

-- 3) Check-ins por mês (últimos 12 meses)
SELECT
  to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
  COUNT(*) AS checkins
FROM public.queue_entries
WHERE deleted_at IS NULL
  AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '12 months')
GROUP BY 1
ORDER BY 1 DESC;

-- 4) Média semanal (últimas 8 semanas)
SELECT
  ROUND(COUNT(*)::numeric / GREATEST(COUNT(DISTINCT date_trunc('week', created_at AT TIME ZONE 'America/Sao_Paulo')), 1), 1)
    AS media_checkins_por_semana
FROM public.queue_entries
WHERE deleted_at IS NULL
  AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '8 weeks');

-- 5) Finalizados por dia (últimos 14 dias úteis operacionais)
SELECT
  to_char(COALESCE(finished_at, updated_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
  COUNT(*) AS finalizados
FROM public.queue_entries
WHERE deleted_at IS NULL
  AND status::text = 'finalizado'
  AND COALESCE(finished_at, updated_at) >= (NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '14 days')
GROUP BY 1
ORDER BY 1 DESC;

-- 6) Projeção simples (quanto sobra no plano Free ~500 MB)
WITH uso AS (
  SELECT pg_database_size(current_database())::bigint AS bytes_usados
)
SELECT
  pg_size_pretty(bytes_usados) AS uso_atual,
  pg_size_pretty((500 * 1024 * 1024)::bigint) AS limite_free_aprox,
  pg_size_pretty(GREATEST((500 * 1024 * 1024)::bigint - bytes_usados, 0)) AS folga_free_aprox,
  ROUND(100.0 * bytes_usados / (500 * 1024 * 1024), 2) AS pct_do_free_usado
FROM uso;
