#!/usr/bin/env sh
# Build do FrotaTMS para Vercel (front em public/ + Prisma Postgres).
# Não altera o FilaDock. Root Directory do projeto Vercel = frota-tms
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x scripts/prepare-postgres-schema.sh scripts/apply-database-schema.sh

echo "→ build web"
VITE_DISABLE_SOCKET=true npm run build --prefix web

echo "→ copiar front para public/ (CDN da Vercel)"
rm -rf public
mkdir -p public
cp -r web/dist/. public/

echo "→ Prisma generate (Postgres)"
./scripts/prepare-postgres-schema.sh api/prisma/schema.prisma
npm exec --prefix api -- prisma generate --schema api/prisma/schema.prisma

if [ -n "${DATABASE_URL:-}" ]; then
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
  echo "→ prisma migrate deploy"
  ./scripts/apply-database-schema.sh
else
  echo "DATABASE_URL vazia — pulando migrate (configure no projeto Vercel)."
fi

echo "Build Vercel concluído."
