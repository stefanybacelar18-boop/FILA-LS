#!/usr/bin/env bash
# Restaura um dump .sql.gz no Postgres (banco Free novo no Render).
# Uso:
#   FORCE_RESTORE=true DATABASE_URL="postgresql://..." ./scripts/restore.sh backups/frota-tms-XXXX.sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${DATABASE_URL:-}"
FILE="${1:-}"

if [ "${FORCE_RESTORE:-}" != "true" ]; then
  echo "Defina FORCE_RESTORE=true para confirmar o restore (apaga/substitui tabelas do destino)." >&2
  exit 1
fi

if [ -z "$URL" ]; then
  echo "DATABASE_URL vazio." >&2
  exit 1
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Arquivo de dump não encontrado. Passe o .sql.gz." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql não encontrado. Instale postgresql-client." >&2
  exit 1
fi

echo "Restaurando $FILE → Postgres..."
gunzip -c "$FILE" | psql "$URL" --set ON_ERROR_STOP=1 --quiet
echo "Restore concluído."
