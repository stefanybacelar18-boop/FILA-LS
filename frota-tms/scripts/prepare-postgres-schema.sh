#!/usr/bin/env sh
# Troca o provider Prisma de sqlite → postgresql (somente no build/deploy do FrotaTMS).
# Não altera o FilaDock. Uso: ./scripts/prepare-postgres-schema.sh [caminho/schema.prisma]
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SCHEMA="${1:-$ROOT/api/prisma/schema.prisma}"
LOCK="$(dirname "$SCHEMA")/migrations/migration_lock.toml"

if [ ! -f "$SCHEMA" ]; then
  echo "Schema não encontrado: $SCHEMA" >&2
  exit 1
fi

if grep -q 'provider = "postgresql"' "$SCHEMA"; then
  echo "Prisma já está em postgresql: $SCHEMA"
  exit 0
fi

echo "Ajustando Prisma provider → postgresql ($SCHEMA)"
sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
if ! grep -q 'directUrl' "$SCHEMA"; then
  sed -i 's/url      = env("DATABASE_URL")/url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")/' "$SCHEMA"
fi
if [ -f "$LOCK" ]; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' "$LOCK" || true
fi
