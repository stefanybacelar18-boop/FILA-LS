-- FilaDock - Verificar o que já existe no banco
-- Rode no SQL Editor antes de executar qualquer schema

SELECT 'Tabelas' AS tipo, tablename AS nome
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'settings', 'queue_entries', 'queue_history')

UNION ALL

SELECT 'Tipos ENUM' AS tipo, typname AS nome
FROM pg_type
WHERE typname IN ('user_role', 'queue_status')

UNION ALL

SELECT 'Trigger auth' AS tipo, tgname AS nome
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
