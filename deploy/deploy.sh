#!/bin/sh
set -eu
umask 077

cd "$(dirname "$0")/.."
. ./deploy/instance.sh
sha=${2:?Supply the release commit SHA}
if [ "$(git rev-parse HEAD)" != "$sha" ] || [ -n "$(git status --porcelain)" ]; then
  echo 'Release checkout must be clean and at the requested SHA.' >&2
  exit 2
fi

exec 9>"$state/operation.lock"
flock 9
maintenance="$state/maintenance"
if [ -e "$maintenance" ]; then
  echo "An interrupted release requires recovery: $maintenance" >&2
  exit 1
fi

# Reject a production env that would send migrations to an external or shared DB.
compose --profile tools config --format json | python3 -c '
import json, re, sys
config = json.load(sys.stdin)
services = config["services"]
app_url = services["app"]["environment"]["DATABASE_URL"]
migrate_url = services["migrate"]["environment"]["DATABASE_URL"]
if config["name"] != sys.argv[1] or app_url != migrate_url or not re.fullmatch(r"postgres(?:ql)?://[^/]+@postgres:5432/[^/?]+", app_url):
    sys.exit("App and migrations must use the isolated PostgreSQL service.")
' "$instance"
services=app
if [ "$instance" = aparts ]; then services='app guest'; fi
rollback="$state/rollback"
mkdir -p "$rollback"
# shellcheck disable=SC2086
for service in $services; do
  container=$(compose ps -aq "$service")
  rm -f "$rollback/$service.image"
  if [ -n "$container" ]; then
    image=$(docker inspect --format '{{.Image}}' "$container")
    docker image tag "$image" "$instance-$service:rollback"
    printf '%s\n' "$instance-$service:rollback" > "$rollback/$service.image"
  fi
done

# Build while the old version is still live.
# shellcheck disable=SC2086
compose build $services migrate
compose up -d --wait postgres

stopped=false
migration_attempted=false
gate_owned=false
recover() {
  result=$?
  trap - EXIT HUP INT TERM
  if [ "$result" -eq 0 ]; then exit 0; fi
  set +e
  if ! "$stopped"; then
    if "$gate_owned"; then rm -f "$maintenance"; fi
    exit "$result"
  fi

  # Traffic is gated until both the old database and old application are ready.
  compose stop app || exit "$result"
  if "$migration_attempted"; then
    compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --exit-on-error --clean --if-exists --create -U "$POSTGRES_USER" -d postgres' \
      < "$rollback/database.dump" || exit "$result"
  fi

  if [ -s "$rollback/app.image" ]; then
    previous_services=
    # shellcheck disable=SC2086
    for service in $services; do
      if [ -s "$rollback/$service.image" ]; then
        docker image tag "$(cat "$rollback/$service.image")" "$instance-$service:latest" || exit "$result"
        previous_services="$previous_services $service"
      fi
    done
    # shellcheck disable=SC2086
    compose up -d --wait --no-build $previous_services || exit "$result"
    rm -f "$maintenance"
    echo "Previous $instance release restored." >&2
  else
    rm -f "$maintenance"
    echo "First $instance release failed. Database restored if migration started." >&2
  fi
  exit "$result"
}
trap recover EXIT
trap 'exit 1' HUP INT TERM
: > "$maintenance"
gate_owned=true
check_maintenance_gate

stopped=true
compose stop app
dump_database > "$rollback/database.dump.new"
mv "$rollback/database.dump.new" "$rollback/database.dump"
migration_attempted=true
compose run --rm --no-deps migrate
# shellcheck disable=SC2086
compose up -d --wait --no-build $services
curl --fail --silent --show-error "http://127.0.0.1:$port/api/health" >/dev/null
curl --fail --silent --show-error "http://127.0.0.1:$port/manifest.webmanifest" \
  | python3 -c 'import json, sys; sys.exit(json.load(sys.stdin)["name"] != sys.argv[1])' "$brand_name"
printf '%s\n' "$sha" > "$state/release-sha.new"
mv "$state/release-sha.new" "$state/release-sha"
rm -f "$maintenance"
trap - EXIT HUP INT TERM
printf '%s deployed at %s\n' "$instance" "$sha"
