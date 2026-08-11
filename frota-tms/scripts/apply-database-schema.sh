#!/usr/bin/env sh
# Aplica schema do banco: migrate deploy (Postgres) ou db push (SQLite dev).
# Uso:
#   ./scripts/apply-database-schema.sh          (a partir de frota-tms/)
#   DATABASE_URL=postgresql://... ./scripts/apply-database-schema.sh
set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
URL="${DATABASE_URL:-}"

if [ -f "$ROOT/api/prisma/schema.prisma" ]; then
  API_DIR="$ROOT/api"
  SCHEMA="$ROOT/api/prisma/schema.prisma"
elif [ -f "$ROOT/prisma/schema.prisma" ]; then
  API_DIR="$ROOT"
  SCHEMA="$ROOT/prisma/schema.prisma"
else
  echo "Schema Prisma não encontrado em $ROOT" >&2
  exit 1
fi

if [ -z "$URL" ] && [ -f "$API_DIR/.env" ]; then
  URL="$(grep -E '^DATABASE_URL=' "$API_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi

cd "$API_DIR"

is_postgres() {
  echo "${URL:-}" | grep -qiE '^postgres(ql)?://'
}

if is_postgres; then
  echo "PostgreSQL detectado — prisma migrate deploy"
  PREPARE="$ROOT/scripts/prepare-postgres-schema.sh"
  if [ ! -x "$PREPARE" ] && [ -x "$API_DIR/scripts/prepare-postgres-schema.sh" ]; then
    PREPARE="$API_DIR/scripts/prepare-postgres-schema.sh"
  fi
  if [ -x "$PREPARE" ]; then
    "$PREPARE" "$SCHEMA"
  fi
  npx prisma generate --schema "$SCHEMA" >/dev/null

  if npx prisma migrate deploy --schema "$SCHEMA"; then
    echo "Migrations aplicadas."
    exit 0
  fi

  echo "migrate deploy falhou — verificando banco legado (criado com db push)..." >&2
  LEGACY_CHECK="$(npx prisma db execute --schema "$SCHEMA" --stdin <<'SQL' 2>/dev/null || true
SELECT 1 AS ok FROM "User" LIMIT 1;
SQL
)"
  if ! echo "$LEGACY_CHECK" | grep -q 'ok'; then
    echo "Falha ao aplicar migrations e banco não parece legado. Abortando." >&2
    exit 1
  fi

  echo "Baseline: marcando migrations existentes como aplicadas..."
  for dir in prisma/migrations/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    [ -f "$dir/migration.sql" ] || continue
    npx prisma migrate resolve --applied "$name" --schema "$SCHEMA" 2>/dev/null || true
  done

  npx prisma migrate deploy --schema "$SCHEMA"
  echo "Baseline concluído — migrations sincronizadas."
  exit 0
fi

echo "SQLite / dev — prisma db push"
npx prisma db push --schema "$SCHEMA"
