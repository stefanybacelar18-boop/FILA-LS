#!/usr/bin/env sh
# Mantém o Render Free acordado com rajadas de ping (health + home).
# Uso:
#   ./scripts/render-keepalive.sh
#   BASE_URL=https://frota-tms.onrender.com KEEPALIVE_ROUNDS=6 ./scripts/render-keepalive.sh
set -e

BASE_URL="${BASE_URL:-https://frota-tms.onrender.com}"
BASE_URL="${BASE_URL%/}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/api/health}"
ROUNDS="${KEEPALIVE_ROUNDS:-6}"
INTERVAL="${KEEPALIVE_INTERVAL_SEC:-150}"

ping_once() {
  url="$1"
  label="$2"
  if curl -fsS --max-time 90 "$url" >/dev/null; then
    echo "OK $label"
    return 0
  fi
  echo "falhou $label"
  return 1
}

echo "Keep-alive: $ROUNDS rodadas, intervalo ${INTERVAL}s"
echo "Health: $HEALTH_URL"
echo "Home:   $BASE_URL/"

round=1
while [ "$round" -le "$ROUNDS" ]; do
  echo "--- rodada $round/$ROUNDS ---"
  ping_once "$HEALTH_URL" "health" || true
  ping_once "$BASE_URL/" "home" || true
  if [ "$round" -lt "$ROUNDS" ]; then
    sleep "$INTERVAL"
  fi
  round=$((round + 1))
done

echo "Keep-alive concluído."
