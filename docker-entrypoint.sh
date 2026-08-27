#!/bin/sh
set -eu
attempt=1
max_attempts=12
until node scripts/migrate.mjs; do
  if [ "$attempt" -ge "$max_attempts" ]; then echo "Database migration failed after $max_attempts attempts."; exit 1; fi
  echo "Database is not ready; retrying migration in 5 seconds ($attempt/$max_attempts)."
  attempt=$((attempt + 1)); sleep 5
done
node scripts/bootstrap.mjs
exec "$@"
