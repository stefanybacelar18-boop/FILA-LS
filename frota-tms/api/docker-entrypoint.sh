#!/bin/sh
set -e

mkdir -p /app/data /app/backups /app/uploads/trip-evidence

if [ -x ./scripts/apply-database-schema.sh ]; then
  ./scripts/apply-database-schema.sh
elif [ -f /app/scripts/apply-database-schema.sh ]; then
  /app/scripts/apply-database-schema.sh
else
  # Fallback legado
  if echo "${DATABASE_URL:-}" | grep -qiE '^postgres(ql)?://'; then
    if [ -x ./scripts/prepare-postgres-schema.sh ]; then
      ./scripts/prepare-postgres-schema.sh ./prisma/schema.prisma
    fi
    npx prisma generate >/dev/null
    npx prisma migrate deploy
  else
    npx prisma db push
  fi
fi

# NUNCA reseedar automaticamente em produção (apagaria dados operacionais).
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — executando seed (bootstrap)..."
  FORCE_SEED="${FORCE_SEED:-true}" npx tsx prisma/seed.ts
else
  echo "Seed automático desligado (defina SEED_ON_START=true só no primeiro bootstrap)."
fi

exec node dist/index.js
