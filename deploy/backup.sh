#!/bin/sh
set -eu
umask 077

cd "$(dirname "$0")/.."
. ./deploy/instance.sh
: "${CRM_BACKUP_REMOTE:?Set CRM_BACKUP_REMOTE to an offsite rclone remote and prefix}"
case "$CRM_BACKUP_REMOTE" in
  :*|/*|*[!a-zA-Z0-9_:/.-]* ) echo 'Invalid backup remote' >&2; exit 2 ;;
  *:*) ;;
  *) echo 'Backup destination must use an offsite rclone remote' >&2; exit 2 ;;
esac

exec 9>"$state/operation.lock"
flock 9
maintenance="$state/maintenance"
test ! -e "$maintenance"
app=$(compose ps -q app)
test -n "$app"
app_image=$(docker inspect --format '{{.Image}}' "$app")
mkdir -p "$state/backups"
snapshot=$(mktemp -d "$state/backups/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
stopped=false
resume() {
  if "$stopped"; then
    compose start --wait app || return 1
    stopped=false
  fi
  rm -f "$maintenance"
}
on_exit() {
  result=$?
  trap - EXIT HUP INT TERM
  resume || exit 1
  exit "$result"
}
trap on_exit EXIT
trap 'exit 1' HUP INT TERM

: > "$maintenance"
check_maintenance_gate
stopped=true
compose stop app
dump_database > "$snapshot/database.dump"
docker run --rm --network none --volumes-from "$app:ro" --entrypoint tar \
  "$app_image" -C /app/.data/uploads -czf - . > "$snapshot/uploads.tar.gz"
resume
trap - EXIT HUP INT TERM
flock -u 9

(
  cd "$snapshot"
  sha256sum database.dump uploads.tar.gz > SHA256SUMS
)
destination="${CRM_BACKUP_REMOTE%/}/$instance/${snapshot##*/}"
rclone copy "$snapshot" "$destination"
rclone check --download "$snapshot" "$destination"
rm -r "$snapshot"
printf 'Verified offsite backup: %s\n' "$destination"
