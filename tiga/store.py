"""SQLite store for everything Tiga's bots need to remember.

Interface: `Store(path)`. Job claims make scheduled work idempotent, issues move
through one state machine (every step audited), suppressions are permanent.
Callers never see SQL; statuses change only through `transition_issue`.
"""
import sqlite3
import threading
from datetime import datetime, timezone

ISSUE_FLOW = {
    "open": {"triaged", "rejected"},
    "triaged": {"approved", "rejected"},
    "approved": {"in_progress", "rejected"},
    "in_progress": {"pr_open", "approved"},
    "pr_open": {"tested", "in_progress", "rejected"},
    "tested": {"done", "in_progress"},
    "done": set(),
    "rejected": set(),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS job_runs (
    job_name TEXT NOT NULL, run_date TEXT NOT NULL, claimed_at TEXT NOT NULL,
    UNIQUE (job_name, run_date)
);
CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', severity TEXT NOT NULL DEFAULT 'normal',
    source TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
    occurrences INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppressions (
    address TEXT PRIMARY KEY, reason TEXT NOT NULL, added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL,
    action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
"""


class TransitionError(ValueError):
    """The requested issue status change is not allowed from the current status."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            if path != ":memory:":
                self._db.execute("PRAGMA journal_mode=WAL")
            self._db.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # --- scheduled jobs -------------------------------------------------
    def claim_job(self, job_name: str, run_date: str) -> bool:
        """True only for the first caller for this (job, date); a restart or double fire gets False."""
        with self._lock, self._db:
            cur = self._db.execute(
                "INSERT OR IGNORE INTO job_runs (job_name, run_date, claimed_at) VALUES (?, ?, ?)",
                (job_name, run_date, _now()),
            )
            return cur.rowcount == 1

    def release_job(self, job_name: str, run_date: str) -> None:
        """Give the claim back after a failure so the job can be retried."""
        with self._lock, self._db:
            self._db.execute("DELETE FROM job_runs WHERE job_name = ? AND run_date = ?", (job_name, run_date))

    # --- issues ---------------------------------------------------------
    def open_issue(self, kind: str, title: str, *, dedupe_key: str, source: str,
                   body: str = "", severity: str = "normal") -> dict:
        """File an issue, or count another occurrence of the one with this key.

        A user's rejection stands; a finished issue that recurs is reopened.
        """
        with self._lock, self._db:
            row = self._db.execute("SELECT * FROM issues WHERE dedupe_key = ?", (dedupe_key,)).fetchone()
            now = _now()
            if row is None:
                cur = self._db.execute(
                    "INSERT INTO issues (kind, title, body, severity, source, dedupe_key, created_at, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (kind, title, body, severity, source, dedupe_key, now, now),
                )
                self._write_audit(source, "issue.open", "issue", str(cur.lastrowid), title)
                return self.get_issue(cur.lastrowid)
            status = "open" if row["status"] == "done" else row["status"]
            self._db.execute(
                "UPDATE issues SET occurrences = occurrences + 1, status = ?, updated_at = ? WHERE id = ?",
                (status, now, row["id"]),
            )
            if status != row["status"]:
                self._write_audit(source, "issue.reopen", "issue", str(row["id"]), "regression")
            return self.get_issue(row["id"])

    def transition_issue(self, issue_id: int, status: str, *, actor: str) -> dict:
        with self._lock, self._db:
            row = self._db.execute("SELECT status FROM issues WHERE id = ?", (issue_id,)).fetchone()
            if row is None:
                raise KeyError(f"no issue {issue_id}")
            if status not in ISSUE_FLOW.get(row["status"], set()):
                raise TransitionError(f"{row['status']} -> {status} is not allowed")
            self._db.execute("UPDATE issues SET status = ?, updated_at = ? WHERE id = ?", (status, _now(), issue_id))
            self._write_audit(actor, "issue.transition", "issue", str(issue_id), f"{row['status']} -> {status}")
        return self.get_issue(issue_id)

    def get_issue(self, issue_id: int) -> dict:
        with self._lock:
            row = self._db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if row is None:
            raise KeyError(f"no issue {issue_id}")
        return dict(row)

    def list_issues(self, status: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM issues", ()
        if status:
            sql, args = sql + " WHERE status = ?", (status,)
        with self._lock:
            return [dict(r) for r in self._db.execute(sql + " ORDER BY id", args)]

    # --- suppressions ---------------------------------------------------
    def suppress(self, address: str, *, reason: str) -> None:
        """Never email this address again. `@domain.tld` suppresses the whole domain."""
        with self._lock, self._db:
            cur = self._db.execute(
                "INSERT OR IGNORE INTO suppressions (address, reason, added_at) VALUES (?, ?, ?)",
                (address.strip().lower(), reason, _now()),
            )
            if cur.rowcount:
                self._write_audit("system", "suppress", "address", address.strip().lower(), reason)

    def is_suppressed(self, address: str) -> bool:
        address = address.strip().lower()
        domain = "@" + address.rpartition("@")[2]
        with self._lock:
            row = self._db.execute(
                "SELECT 1 FROM suppressions WHERE address IN (?, ?)", (address, domain)
            ).fetchone()
        return row is not None

    def suppressions(self) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._db.execute("SELECT * FROM suppressions ORDER BY added_at, address")]

    # --- audit ----------------------------------------------------------
    def audit(self, actor: str, action: str, entity: str, entity_id: str, detail: str = "") -> None:
        with self._lock, self._db:
            self._write_audit(actor, action, entity, entity_id, detail)

    def audit_log(self, limit: int = 200) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM audit_log ORDER BY id LIMIT ?", (limit,))
            return [dict(r) for r in rows]

    def _write_audit(self, actor, action, entity, entity_id, detail="") -> None:
        self._db.execute(
            "INSERT INTO audit_log (ts, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
            (_now(), actor, action, entity, entity_id, detail),
        )
