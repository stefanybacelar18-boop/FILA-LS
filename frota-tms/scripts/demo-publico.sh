#!/usr/bin/env bash
# Sobe API+front e abre túnel Cloudflare público (teste sem notebook local).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$ROOT/web/dist/index.html" ]]; then
  echo "Building web..."
  npm run build --prefix "$ROOT/web"
fi

if [[ ! -x /tmp/cloudflared ]]; then
  echo "Baixando cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  chmod +x /tmp/cloudflared
fi

export CORS_ORIGIN="*"
cd "$ROOT/api"
npm run dev &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

sleep 2
echo "Abrindo túnel público..."
/tmp/cloudflared tunnel --url http://localhost:4000 --no-autoupdate
