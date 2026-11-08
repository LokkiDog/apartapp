# Sourced after changing to the instance's dedicated Git checkout.
case "${1:-}" in
  aparts)
    instance=aparts
    hostname=crm.aparts-bansko.com
    port=3000
    brand_name='Aparts CRM'
    ;;
  magicmop)
    instance=magicmop
    hostname=app.magicmopcrm.com
    port=3002
    brand_name=MagicMop
    ;;
  *)
    echo 'Specify the instance: aparts or magicmop.' >&2
    exit 2
    ;;
esac

state="/var/lib/aparts-deploy/$instance"
env_file="$PWD/.env.production"
if [ ! -r "$state/checkout" ] || [ "$(cat "$state/checkout")" != "$PWD" ] || [ ! -r "$env_file" ]; then
  echo "Checkout or production env does not match $instance." >&2
  exit 2
fi

# Do not allow inherited overrides to select another instance's project or env.
export APARTS_ENV_FILE="$env_file" CRM_DEPLOY_BRAND="$instance"
export NUXT_PUBLIC_APP_URL="https://$hostname"

compose() {
  if [ "$instance" = magicmop ]; then
    set -- -f docker-compose.magicmop.yml "$@"
  else
    set -- -f docker-compose.prod.yml "$@"
  fi
  docker compose -p "$instance" --env-file "$env_file" "$@"
}

dump_database() {
  compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

check_maintenance_gate() {
  status=$(curl --silent --show-error --max-time 10 --resolve "$hostname:443:127.0.0.1" \
    --output /dev/null --write-out '%{http_code}' "https://$hostname/api/health")
  if [ "$status" != 503 ]; then
    echo "Nginx must return 503 during maintenance for $hostname." >&2
    return 1
  fi
}
