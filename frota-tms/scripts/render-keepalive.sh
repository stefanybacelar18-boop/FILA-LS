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
# Curto de propósito: na tela de spin-up o Render segura a conexão sem bytes.
CURL_MAX_TIME="${KEEPALIVE_CURL_MAX_TIME:-25}"

ping_once() {
  url="$1"
  label="$2"
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$CURL_MAX_TIME" "$url" || true)"
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    echo "OK $label ($code)"
    return 0
  fi
  if [ -n "$code" ] && [ "$code" != "000" ]; then
    echo "ping $label HTTP $code"
    return 0
  fi
  echo "falhou $label (sem resposta)"
  return 1
}

echo "Keep-alive: $ROUNDS rodadas, intervalo ${INTERVAL}s, curl ${CURL_MAX_TIME}s"
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
