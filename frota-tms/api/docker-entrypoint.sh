#!/bin/sh
set -e
mkdir -p /app/data
npx prisma db push
npx tsx prisma/seed.ts || true
exec node dist/index.js
