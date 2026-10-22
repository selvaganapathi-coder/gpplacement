#!/bin/sh
# Render / Docker entrypoint: migrate schema, optional demo seed, start API+UI.
set -e

echo "[start] prisma db push"
npx prisma db push

if [ "${SEED_ON_START}" = "true" ]; then
  if [ "${NODE_ENV}" = "production" ] && [ "${ALLOW_DEMO_SEED}" != "true" ]; then
    echo "[start] Skipping demo seed in production (set ALLOW_DEMO_SEED=true for trial/staging only)."
  else
    echo "[start] Running demo seed (ALLOW_DEMO_SEED / non-production)"
    # Production always forces password change inside seed.ts
    export SEED_FORCE_PASSWORD_CHANGE="${SEED_FORCE_PASSWORD_CHANGE:-true}"
    npm run db:seed
  fi
else
  echo "[start] SEED_ON_START is not true — not seeding demo accounts"
fi

echo "[start] launching API"
exec node dist-server/server/index.js
