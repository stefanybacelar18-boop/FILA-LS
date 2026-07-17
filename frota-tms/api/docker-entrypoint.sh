#!/bin/sh
set -e
mkdir -p /app/data
npx prisma db push

# NUNCA reseedar automaticamente em produção (apagaria dados operacionais).
# Use SEED_ON_START=true apenas no bootstrap inicial / ambiente de demo.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — executando seed..."
  npx tsx prisma/seed.ts
else
  echo "Seed automático desligado (defina SEED_ON_START=true só no primeiro bootstrap)."
fi

exec node dist/index.js
