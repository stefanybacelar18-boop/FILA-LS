#!/bin/sh
set -e
npx prisma db push
npx tsx prisma/seed.ts || true
node dist/index.js
