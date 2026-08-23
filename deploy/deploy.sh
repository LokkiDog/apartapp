#!/bin/sh
set -eu

repository_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_dir"

if [ ! -f .env.production ]; then
  echo "Missing $repository_dir/.env.production" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Deployment checkout is dirty; commit or remove server-side changes first." >&2
  exit 1
fi

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Deployment checkout must be on the main branch." >&2
  exit 1
fi

compose="docker compose --env-file .env.production -f docker-compose.prod.yml"

git fetch origin main
git merge --ff-only origin/main

$compose config --quiet
$compose build app migrate
$compose up -d --wait postgres
$compose stop app
$compose run --rm migrate
$compose up -d --wait app

echo "Aparts CRM deployed successfully."
$compose ps
