#!/bin/sh
set -e

# If RUN_MIGRATIONS is set to "true", run Prisma migrations before starting
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] RUN_MIGRATIONS=true detected. Applying Prisma migrations..."
  npx prisma migrate deploy
  echo "[entrypoint] Prisma migrations completed."
fi

# Execute the container's main command
exec "$@"
