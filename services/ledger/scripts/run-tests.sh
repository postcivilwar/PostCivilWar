#!/usr/bin/env bash
# Runs the ledger contract tests against a throwaway PostgreSQL cluster.
#
# Needs only a local PostgreSQL install (initdb, pg_ctl, psql, pgbench) and
# Python 3. No packages are downloaded. The cluster is created in a temporary
# directory, listens on 127.0.0.1 only, and is deleted afterwards.
#
#   NLW_PG_BIN   directory holding initdb/pg_ctl/psql/pgbench (auto-detected)
#   NLW_PG_TMP   parent directory for the temporary cluster (default: mktemp)
#   NLW_PG_PORT  port to listen on (default: a free port)
#
# PostgreSQL refuses to run as root. When this script is run as root it runs
# the server as the "postgres" system user instead.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${NLW_PG_BIN:-}" ]]; then
  if command -v pg_ctl >/dev/null 2>&1; then
    NLW_PG_BIN="$(dirname "$(command -v pg_ctl)")"
  else
    NLW_PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  fi
fi
[[ -x "${NLW_PG_BIN}/pg_ctl" ]] || { echo "PostgreSQL server binaries not found; set NLW_PG_BIN" >&2; exit 2; }
export PATH="${NLW_PG_BIN}:${PATH}"

as_pg=()
if [[ "$(id -u)" == "0" ]]; then
  id postgres >/dev/null 2>&1 || { echo "running as root needs a 'postgres' system user" >&2; exit 2; }
  as_pg=(runuser -u postgres --)
fi

parent="${NLW_PG_TMP:-}"
if [[ -n "${parent}" ]]; then
  "${as_pg[@]}" mkdir -p "${parent}"
  work="$("${as_pg[@]}" mktemp -d "${parent%/}/nlw.XXXXXX")"
else
  work="$(mktemp -d)"
  [[ "$(id -u)" == "0" ]] && chown postgres "${work}"
fi
chmod 755 "${work}"   # the invoking user must reach the socket directory
data="${work}/data"
sock="${work}/s"
"${as_pg[@]}" mkdir -p "${sock}"

port="${NLW_PG_PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')}"

cleanup() {
  "${as_pg[@]}" pg_ctl -D "${data}" -m immediate -w stop >/dev/null 2>&1 || true
  "${as_pg[@]}" rm -rf "${work}" 2>/dev/null || rm -rf "${work}" 2>/dev/null || true
}
trap cleanup EXIT

# Local socket: trust (admin, this machine only). TCP: passwords, as in production.
"${as_pg[@]}" initdb -D "${data}" -U postgres -E UTF8 --locale=C \
  --auth-local=trust --auth-host=scram-sha-256 >/dev/null
"${as_pg[@]}" pg_ctl -D "${data}" -w -l "${work}/postgres.log" \
  -o "-c listen_addresses=127.0.0.1 -c port=${port} -c unix_socket_directories=${sock} -c max_connections=120 -c fsync=off" \
  start >/dev/null

export NLW_PG_SOCKET="${sock}" NLW_PG_PORT="${port}" NLW_LEDGER_MIGRATIONS="${NLW_LEDGER_MIGRATIONS:-${here}/migrations}"
cd "${here}"
python3 -m unittest discover -s tests -p 'test_*.py' "$@"
