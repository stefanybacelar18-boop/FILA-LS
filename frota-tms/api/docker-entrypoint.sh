#!/bin/sh
set -e

mkdir -p /app/data /app/backups

# Schema: se URL for Postgres e provider ainda for sqlite, ajusta em runtime
if echo "${DATABASE_URL:-}" | grep -qiE '^postgres(ql)?://'; then
  if grep -q 'provider = "sqlite"' prisma/schema.prisma 2>/dev/null; then
    echo "Ajustando Prisma provider → postgresql"
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
    if [ -f prisma/migrations/migration_lock.toml ]; then
      sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/migrations/migration_lock.toml || true
    fi
    npx prisma generate
  fi
  echo "Aplicando schema no PostgreSQL..."
else
  echo "Aplicando schema (SQLite)..."
fi

npx prisma db push

# NUNCA reseedar automaticamente em produção (apagaria dados operacionais).
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — executando seed (bootstrap)..."
  FORCE_SEED="${FORCE_SEED:-true}" npx tsx prisma/seed.ts
else
  echo "Seed automático desligado (defina SEED_ON_START=true só no primeiro bootstrap)."
fi

exec node dist/index.js
