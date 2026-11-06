#!/bin/sh
set -eu
umask 077
destination=${1:?Supply the exact offsite backup directory printed by backup.sh}
scratch=$(mktemp -d)
container=
cleanup() {
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

rclone copy "$destination" "$scratch"
(cd "$scratch" && sha256sum --check SHA256SUMS)
container=$(docker run --rm -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
attempt=0
until docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || exit 1
  sleep 1
done
docker exec "$container" createdb -U postgres restore_check
docker exec -i "$container" pg_restore -U postgres --no-owner --no-privileges \
  --exit-on-error -d restore_check < "$scratch/database.dump"
docker exec "$container" psql -U postgres -d restore_check -v ON_ERROR_STOP=1 \
  -c 'select count(*) from public.organizations'
mkdir "$scratch/uploads"
tar -xzf "$scratch/uploads.tar.gz" -C "$scratch/uploads"
echo 'Database and uploads restored in isolation.'
