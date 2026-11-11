#!/usr/bin/env bash
# Exit 0 = skip Vercel build; exit 1 = continue build.
# Skip root FilaDock deploy when only Cortely / frota / CI config changed.
set -u

echo "[vercel-ignore] ref=${VERCEL_GIT_COMMIT_REF:-?} sha=${VERCEL_GIT_COMMIT_SHA:-?}"

git fetch --deepen=20 2>/dev/null || true

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [[ -z "$PREV" ]] || ! git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
    PREV="$(git rev-parse HEAD^)"
  else
    echo "[vercel-ignore] no previous SHA — skip root build"
    exit 0
  fi
fi

echo "[vercel-ignore] comparing ${PREV}..HEAD"

# Paths that should NOT force a FilaDock (root) deploy
if git diff --quiet "$PREV" HEAD -- . \
  ':(exclude)frota-tms' \
  ':(exclude)frota-tms/**' \
  ':(exclude)cortely' \
  ':(exclude)cortely/**' \
  ':(exclude).github/workflows/cortely-ci.yml' \
  ':(exclude)vercel.json' \
  ':(exclude)scripts/vercel-ignore.sh'
then
  echo "[vercel-ignore] no root-app changes — skip"
  exit 0
fi

echo "[vercel-ignore] root-app changes detected — build"
git diff --name-only "$PREV" HEAD -- . \
  ':(exclude)frota-tms' \
  ':(exclude)frota-tms/**' \
  ':(exclude)cortely' \
  ':(exclude)cortely/**' \
  ':(exclude).github/workflows/cortely-ci.yml' \
  ':(exclude)vercel.json' \
  ':(exclude)scripts/vercel-ignore.sh' || true
exit 1
