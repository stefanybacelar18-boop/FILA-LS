#!/usr/bin/env bash
# Backup do banco FrotaTMS (SQLite local ou Postgres em Docker).
# Uso:
#   ./scripts/backup.sh
#   DATABASE_URL=postgresql://... ./scripts/backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
URL="${DATABASE_URL:-}"

if [ -z "$URL" ] && [ -f "$ROOT/api/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  # carrega só DATABASE_URL se existir
  URL="$(grep -E '^DATABASE_URL=' "$ROOT/api/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  set +a
fi

if echo "${URL:-}" | grep -qiE '^postgres(ql)?://'; then
  FILE="$OUT_DIR/frota-tms-$STAMP.sql.gz"
  echo "Backup Postgres → $FILE"
  if command -v docker >/dev/null 2>&1 && docker compose -f "$ROOT/docker-compose.yml" ps db 2>/dev/null | grep -q healthy; then
    docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_dump -U frota frota_tms | gzip >"$FILE"
  else
    pg_dump "$URL" | gzip >"$FILE"
  fi
else
  DB_FILE="$ROOT/api/prisma/dev.db"
  if [ ! -f "$DB_FILE" ]; then
    DB_FILE="$ROOT/api/dev.db"
  fi
  if [ ! -f "$DB_FILE" ]; then
    echo "Arquivo SQLite não encontrado. Defina DATABASE_URL ou rode o sistema local primeiro."
    exit 1
  fi
  FILE="$OUT_DIR/frota-tms-$STAMP.db"
  echo "Backup SQLite → $FILE"
  cp "$DB_FILE" "$FILE"
fi

echo "OK: $FILE"
ls -lh "$FILE"
