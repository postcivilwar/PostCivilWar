#!/usr/bin/env bash
# Runs a command with a throwaway PostgreSQL server, and tells it where the server is.
#
#   server/with-postgres.sh node --test server/test/*.test.mjs        the server's tests
#   server/with-postgres.sh node server/dev.mjs             the whole site on this machine, accounts and all
#
# Needs only a local PostgreSQL install (initdb, pg_ctl, psql). Nothing is downloaded. The server is made in a
# temporary directory, listens on 127.0.0.1 only, asks for a password as the real one does, and is deleted
# afterwards. The command is given PCW_DATABASE_URL.
#
#   PCW_PG_BIN   directory holding initdb/pg_ctl/psql (found automatically)
#
# PostgreSQL refuses to run as root. Run as root, this runs the server as the "postgres" system user.
set -euo pipefail

if [[ -z "${PCW_PG_BIN:-}" ]]; then
  if command -v pg_ctl >/dev/null 2>&1; then PCW_PG_BIN="$(dirname "$(command -v pg_ctl)")"
  else PCW_PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"; fi
fi
[[ -x "${PCW_PG_BIN}/pg_ctl" ]] || { echo "PostgreSQL server binaries not found; set PCW_PG_BIN" >&2; exit 2; }
export PATH="${PCW_PG_BIN}:${PATH}"

as_pg=()
if [[ "$(id -u)" == "0" ]]; then
  id postgres >/dev/null 2>&1 || { echo "running as root needs a 'postgres' system user" >&2; exit 2; }
  as_pg=(runuser -u postgres --)
fi

work="$(mktemp -d)"
[[ "$(id -u)" == "0" ]] && chown postgres "${work}"
chmod 755 "${work}"
data="${work}/data"; sock="${work}/s"
"${as_pg[@]}" mkdir -p "${sock}"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
password="$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
echo "${password}" > "${work}/pw"; [[ "$(id -u)" == "0" ]] && chown postgres "${work}/pw"

cleanup() {
  "${as_pg[@]}" pg_ctl -D "${data}" -m immediate -w stop >/dev/null 2>&1 || true
  "${as_pg[@]}" rm -rf "${work}" 2>/dev/null || rm -rf "${work}" 2>/dev/null || true
}
trap cleanup EXIT

"${as_pg[@]}" initdb -D "${data}" -U postgres -E UTF8 --locale=C --auth-local=trust --auth-host=scram-sha-256 --pwfile="${work}/pw" >/dev/null
"${as_pg[@]}" pg_ctl -D "${data}" -w -l "${work}/postgres.log" \
  -o "-c listen_addresses=127.0.0.1 -c port=${port} -c unix_socket_directories=${sock} -c max_connections=120 -c fsync=off" start >/dev/null
psql -q -h "${sock}" -p "${port}" -U postgres -c "create database pcw" >/dev/null

export PCW_DATABASE_URL="postgres://postgres:${password}@127.0.0.1:${port}/pcw"
"$@"
