#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "${script_dir}/../.." && pwd)"
backup_dir="${BACKUP_DIR:-${project_dir}/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "${backup_dir}" != /* ]]; then
  backup_dir="${project_dir}/${backup_dir}"
fi

backup_file="${backup_dir}/akita-${timestamp}.dump"
partial_file="${backup_file}.partial"

umask 077
mkdir -p -- "${backup_dir}"

cleanup() {
  rm -f -- "${partial_file}"
}
trap cleanup EXIT

docker compose \
  --project-directory "${project_dir}" \
  --file "${project_dir}/docker-compose.yml" \
  exec --no-TTY db \
  sh -ec 'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "${partial_file}"

if [[ ! -s "${partial_file}" ]]; then
  echo "Backup is empty; refusing to publish it." >&2
  exit 1
fi

mv -- "${partial_file}" "${backup_file}"
(
  cd -- "${backup_dir}"
  sha256sum -- "$(basename -- "${backup_file}")" > "$(basename -- "${backup_file}").sha256"
)

echo "Created ${backup_file}"
echo "Copy this file and its checksum to storage outside this server."
