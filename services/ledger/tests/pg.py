"""Minimal PostgreSQL test helpers built on the psql and pgbench binaries.

The contract tests deliberately use no client library: they need only a
PostgreSQL install and the Python standard library, and they exercise the
database exactly as a service would, one connection per call, logged in as the
service's own role.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import time
from dataclasses import dataclass

SOCKET = os.environ.get("NLW_PG_SOCKET")
PORT = os.environ.get("NLW_PG_PORT")
MIGRATIONS = os.environ.get("NLW_LEDGER_MIGRATIONS")

_ERROR = re.compile(r"(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+(.*)")

# Service logins used by the tests: login name -> ledger group role.
SERVICE_LOGINS = {
    "t_gameplay": "nlw_gameplay",
    "t_monetary": "nlw_monetary",
    "t_settlement": "nlw_settlement",
    "t_watcher": "nlw_chain_watcher",
    "t_signer": "nlw_signer",
    "t_compliance": "nlw_compliance",
    "t_admin": "nlw_ledger_admin",
    "t_auditor": "nlw_auditor",
    "t_stranger": None,  # can log in, belongs to nothing
}
PASSWORD = secrets.token_hex(16)


class PgError(Exception):
    def __init__(self, sqlstate: str, message: str, raw: str):
        super().__init__(f"{sqlstate}: {message}")
        self.sqlstate = sqlstate
        self.message = message
        self.raw = raw


def require_environment() -> None:
    if not (SOCKET and PORT and MIGRATIONS):
        raise RuntimeError(
            "No test database. Run these tests through scripts/run-tests.sh, "
            "which starts a throwaway PostgreSQL cluster."
        )


def lit(value) -> str:
    """Render a Python value as a SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (dict, list)):
        value = json.dumps(value)
    return "'" + str(value).replace("'", "''") + "'"


def _base_args(db: str, role: str | None) -> tuple[list[str], dict]:
    env = dict(os.environ)
    args = ["-X", "-q", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db]
    if role is None:
        # Administrator: local socket, trusted.
        args += ["-h", SOCKET, "-p", PORT, "-U", "postgres"]
    else:
        # Service login: TCP with a password, as a deployed service connects.
        args += ["-h", "127.0.0.1", "-p", PORT, "-U", role]
        env["PGPASSWORD"] = PASSWORD
    return args, env


def _raise_from(stderr: str) -> None:
    match = _ERROR.search(stderr)
    if match:
        raise PgError(match.group(1), match.group(2).strip(), stderr)
    raise PgError("?????", stderr.strip().splitlines()[-1] if stderr.strip() else "psql failed", stderr)


def sql(db: str, *statements: str, role: str | None = None) -> list[list[str]]:
    """Run statements in one session and return the rows of the last one."""
    args, env = _base_args(db, role)
    for statement in statements:
        args += ["-c", statement]
    done = subprocess.run(["psql", *args], env=env, capture_output=True, text=True)
    if done.returncode != 0:
        _raise_from(done.stderr)
    # Statements that return nothing useful (such as taking an advisory lock)
    # print an empty line, which is dropped here; the convention in these tests
    # is that only the last statement of a call returns rows.
    return [line.split("\t") for line in done.stdout.split("\n") if line != ""]


def script(db: str, text: str, role: str | None = None) -> str:
    """Run a multi-statement script from stdin; returns stdout."""
    args, env = _base_args(db, role)
    done = subprocess.run(["psql", *args, "-f", "-"], env=env, input=text, capture_output=True, text=True)
    if done.returncode != 0:
        _raise_from(done.stderr)
    return done.stdout


def one(db: str, statement: str, role: str | None = None) -> str:
    rows = sql(db, statement, role=role)
    assert len(rows) == 1 and len(rows[0]) == 1, f"expected one value, got {rows!r}"
    return rows[0][0]


def ensure_service_logins() -> None:
    for login, group in SERVICE_LOGINS.items():
        membership = f" IN ROLE {group}" if group else ""
        script(
            "postgres",
            f"""
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = {lit(login)}) THEN
                CREATE ROLE {login} LOGIN PASSWORD {lit(PASSWORD)}{membership};
              ELSE
                ALTER ROLE {login} PASSWORD {lit(PASSWORD)};
              END IF;
            END $$;
            """,
        )


def create_ledger_database() -> str:
    """Create an empty database and apply every migration to it."""
    require_environment()
    name = "nlw_ledger_" + secrets.token_hex(4)
    sql("postgres", f"CREATE DATABASE {name}")
    args, env = _base_args(name, None)
    for filename in sorted(os.listdir(MIGRATIONS)):
        if not filename.endswith(".sql"):
            continue
        done = subprocess.run(
            ["psql", *args, "--single-transaction", "-f", os.path.join(MIGRATIONS, filename)],
            env=env, capture_output=True, text=True,
        )
        if done.returncode != 0:
            _raise_from(done.stderr)
    # Group roles are created by the migration; logins need them to exist first.
    ensure_service_logins()
    return name


def drop_database(name: str) -> None:
    sql("postgres", f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")


@dataclass
class Gate:
    """Holds an exclusive advisory lock so that many sessions can queue behind
    it and then be released at the same instant."""

    db: str
    key: int
    process: subprocess.Popen | None = None

    def close(self) -> None:
        args, env = _base_args(self.db, None)
        self.process = subprocess.Popen(
            ["psql", *args, "-f", "-"], env=env, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        self.process.stdin.write(f"SELECT pg_advisory_lock({self.key});\n")
        self.process.stdin.flush()
        deadline = time.time() + 10
        while time.time() < deadline:
            held = one(self.db, f"SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' "
                                f"AND objid = {self.key} AND granted AND mode = 'ExclusiveLock'")
            if held == "1":
                return
            time.sleep(0.02)
        raise RuntimeError("gate did not close")

    def wait_for_queue(self, waiters: int, timeout: float = 30) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            queued = one(self.db, f"SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' "
                                  f"AND objid = {self.key} AND NOT granted")
            if int(queued) >= waiters:
                return
            time.sleep(0.02)
        raise RuntimeError(f"only {queued} of {waiters} sessions reached the gate")

    def open(self) -> None:
        self.process.communicate(timeout=10)  # closes stdin: the session ends and the lock is released

    def wait_statement(self) -> str:
        return f"SELECT pg_advisory_lock_shared({self.key})"


def pgbench(db: str, role: str, script_text: str, clients: int, transactions: int, workdir: str) -> str:
    path = os.path.join(workdir, f"bench_{secrets.token_hex(4)}.sql")
    with open(path, "w") as handle:
        handle.write(script_text)
    env = dict(os.environ, PGPASSWORD=PASSWORD)
    done = subprocess.run(
        ["pgbench", "-n", "-h", "127.0.0.1", "-p", PORT, "-U", role,
         "-c", str(clients), "-j", str(min(clients, 4)), "-t", str(transactions), "-f", path, db],
        env=env, capture_output=True, text=True,
    )
    os.unlink(path)
    if done.returncode != 0:
        raise RuntimeError(f"pgbench failed:\n{done.stdout}\n{done.stderr}")
    return done.stdout
