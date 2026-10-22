"""SQLite store for everything Tiga's bots need to remember.

Interface: `Store(path)`. Job claims make scheduled work idempotent, issues move
through one state machine (every step audited), suppressions are permanent.
Callers never see SQL; statuses change only through `transition_issue`.
"""
import json
import sqlite3
import threading
from datetime import datetime, timezone

DEAL_FLOW = {
    "interested": {"call_booked", "proposal_sent", "lost"},
    "call_booked": {"proposal_sent", "lost"},
    "proposal_sent": {"won", "lost", "call_booked"},
    "won": {"in_progress", "lost"},
    "in_progress": {"delivered"},
    "delivered": {"paid"},
    "paid": set(),
    "lost": {"interested"},
}
CLOSED_DEAL_STAGES = {"paid", "lost"}

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
CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', lead_url TEXT NOT NULL DEFAULT '',
    source_note TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'drafted', warnings TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '', message_id TEXT NOT NULL DEFAULT '',
    thread_id TEXT NOT NULL DEFAULT '', followup_n INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER, sent_at TEXT NOT NULL DEFAULT '', replied_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, report_date TEXT NOT NULL,
    subject TEXT NOT NULL, body TEXT NOT NULL, recipient TEXT NOT NULL,
    created_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '', delivery_error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS interviews (
    id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, source TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '', email_source TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    signals TEXT NOT NULL DEFAULT '[]', problems TEXT NOT NULL DEFAULT '[]', score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', outreach_id INTEGER,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_actions (
    id TEXT PRIMARY KEY, tool TEXT NOT NULL, args TEXT NOT NULL, summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', service TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'interested', amount INTEGER NOT NULL DEFAULT 0,
    advance_paid INTEGER NOT NULL DEFAULT 0, balance_paid INTEGER NOT NULL DEFAULT 0,
    minutes_logged INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
    outreach_id INTEGER, prospect_id INTEGER, paid_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
            columns = {row["name"] for row in self._db.execute("PRAGMA table_info(reports)")}
            if "delivery_error" not in columns:  # databases created before in-app reports
                self._db.execute("ALTER TABLE reports ADD COLUMN delivery_error TEXT NOT NULL DEFAULT ''")

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

    # --- outreach -------------------------------------------------------
    _OUTREACH_FIELDS = {
        "company", "lead_url", "source_note", "region", "subject", "body", "status", "warnings",
        "last_error", "message_id", "thread_id", "followup_n", "parent_id", "sent_at", "replied_at",
    }

    def add_outreach(self, email: str, subject: str, body: str, **fields) -> dict:
        self._check_outreach_fields(fields)
        columns = ["email", "subject", "body", "created_at", "updated_at", *fields]
        values = [email.strip().lower(), subject, body, _now(), _now(), *fields.values()]
        with self._lock, self._db:
            cur = self._db.execute(
                f"INSERT INTO outreach ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})", values
            )
            self._write_audit("system", "outreach.add", "outreach", str(cur.lastrowid), email)
            return self.get_outreach(cur.lastrowid)

    def update_outreach(self, outreach_id: int, *, actor: str = "system", **fields) -> dict:
        self._check_outreach_fields(fields)
        assignments = ", ".join(f"{name} = ?" for name in [*fields, "updated_at"])
        with self._lock, self._db:
            cur = self._db.execute(
                f"UPDATE outreach SET {assignments} WHERE id = ?", [*fields.values(), _now(), outreach_id]
            )
            if cur.rowcount == 0:
                raise KeyError(f"no outreach {outreach_id}")
            if "status" in fields:
                self._write_audit(actor, "outreach.status", "outreach", str(outreach_id), fields["status"])
        return self.get_outreach(outreach_id)

    def get_outreach(self, outreach_id: int) -> dict:
        with self._lock:
            row = self._db.execute("SELECT * FROM outreach WHERE id = ?", (outreach_id,)).fetchone()
        if row is None:
            raise KeyError(f"no outreach {outreach_id}")
        return dict(row)

    def list_outreach(self, *statuses: str, email: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM outreach WHERE 1=1", []
        if statuses:
            sql += f" AND status IN ({', '.join('?' * len(statuses))})"
            args += statuses
        if email:
            sql += " AND email = ?"
            args.append(email.strip().lower())
        with self._lock:
            return [dict(r) for r in self._db.execute(sql + " ORDER BY id", args)]

    def _check_outreach_fields(self, fields: dict) -> None:
        unknown = set(fields) - self._OUTREACH_FIELDS
        if unknown:
            raise ValueError(f"unknown outreach field(s): {', '.join(sorted(unknown))}")

    # --- prospects (businesses the Analyst found) --------------------------
    _PROSPECT_FIELDS = {"source", "name", "category", "website", "email", "email_source", "phone", "address",
                        "link", "title", "signals", "problems", "score", "status", "note", "outreach_id"}
    _PROSPECT_JSON = {"signals", "problems"}
    # Details a fresh sighting may refresh; progress fields (status, email found, problems) are kept.
    _PROSPECT_REFRESH = {"name", "category", "website", "phone", "address", "link", "title"}

    def upsert_prospect(self, data: dict) -> tuple[dict, bool]:
        """Insert by `key`, or refresh the listing details of an existing one. Returns (row, created)."""
        fields = {k: v for k, v in data.items() if k != "key"}
        self._check_prospect_fields(fields)
        with self._lock, self._db:
            row = self._db.execute("SELECT id FROM prospects WHERE key = ?", (data["key"],)).fetchone()
            if row:
                refresh = {k: v for k, v in fields.items() if k in self._PROSPECT_REFRESH and v}
                if refresh:
                    self._write_prospect(row["id"], refresh)
                return self.get_prospect(row["id"]), False
            stored = {k: json.dumps(v) if k in self._PROSPECT_JSON else v for k, v in fields.items()}
            columns = ["key", "created_at", "updated_at", *stored]
            cur = self._db.execute(
                f"INSERT INTO prospects ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})",
                [data["key"], _now(), _now(), *stored.values()],
            )
            return self.get_prospect(cur.lastrowid), True

    def update_prospect(self, prospect_id: int, **fields) -> dict:
        self._check_prospect_fields(fields)
        with self._lock, self._db:
            self._write_prospect(prospect_id, fields)
        return self.get_prospect(prospect_id)

    def get_prospect(self, prospect_id: int) -> dict:
        with self._lock:
            row = self._db.execute("SELECT * FROM prospects WHERE id = ?", (prospect_id,)).fetchone()
        if row is None:
            raise KeyError(f"no prospect {prospect_id}")
        return self._decode_prospect(row)

    def list_prospects(self, *statuses: str, limit: int = 500) -> list[dict]:
        sql, args = "SELECT * FROM prospects", []
        if statuses:
            sql += f" WHERE status IN ({', '.join('?' * len(statuses))})"
            args += statuses
        with self._lock:
            rows = self._db.execute(sql + " ORDER BY score DESC, id LIMIT ?", [*args, limit])
            return [self._decode_prospect(r) for r in rows]

    def prospect_counts(self) -> dict[str, int]:
        with self._lock:
            rows = self._db.execute("SELECT status, COUNT(*) AS n FROM prospects GROUP BY status")
            return {r["status"]: r["n"] for r in rows}

    def _write_prospect(self, prospect_id: int, fields: dict) -> None:
        stored = {k: json.dumps(v) if k in self._PROSPECT_JSON else v for k, v in fields.items()}
        assignments = ", ".join(f"{name} = ?" for name in [*stored, "updated_at"])
        cur = self._db.execute(f"UPDATE prospects SET {assignments} WHERE id = ?", [*stored.values(), _now(), prospect_id])
        if cur.rowcount == 0:
            raise KeyError(f"no prospect {prospect_id}")

    def _decode_prospect(self, row) -> dict:
        out = dict(row)
        for name in self._PROSPECT_JSON:
            out[name] = json.loads(out[name] or "[]")
        return out

    def _check_prospect_fields(self, fields: dict) -> None:
        unknown = set(fields) - self._PROSPECT_FIELDS
        if unknown:
            raise ValueError(f"unknown prospect field(s): {', '.join(sorted(unknown))}")

    # --- deals (a client job from first "interested" to paid) --------------------
    _DEAL_FIELDS = {"contact", "company", "phone", "service", "amount", "advance_paid", "balance_paid",
                    "minutes_logged", "notes", "outreach_id", "prospect_id"}

    def create_deal(self, data: dict) -> dict:
        """Open a deal, or return the client's deal that is still open (one live deal per address)."""
        email = data["email"].strip().lower()
        fields = {k: v for k, v in data.items() if k != "email"}
        self._check_deal_fields(fields)
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT id FROM deals WHERE email = ? AND stage NOT IN ('paid', 'lost') ORDER BY id DESC LIMIT 1",
                (email,)).fetchone()
            if row:
                return self.get_deal(row["id"])
            columns = ["email", "created_at", "updated_at", *fields]
            cur = self._db.execute(
                f"INSERT INTO deals ({', '.join(columns)}) VALUES ({', '.join('?' * len(columns))})",
                [email, _now(), _now(), *fields.values()])
            self._write_audit("system", "deal.open", "deal", str(cur.lastrowid), email)
            return self.get_deal(cur.lastrowid)

    def update_deal(self, deal_id: int, **fields) -> dict:
        self._check_deal_fields(fields)
        assignments = ", ".join(f"{name} = ?" for name in [*fields, "updated_at"])
        with self._lock, self._db:
            cur = self._db.execute(f"UPDATE deals SET {assignments} WHERE id = ?", [*fields.values(), _now(), deal_id])
            if cur.rowcount == 0:
                raise KeyError(f"no deal {deal_id}")
        return self.get_deal(deal_id)

    def move_deal(self, deal_id: int, stage: str, *, actor: str) -> dict:
        with self._lock, self._db:
            row = self._db.execute("SELECT stage FROM deals WHERE id = ?", (deal_id,)).fetchone()
            if row is None:
                raise KeyError(f"no deal {deal_id}")
            if stage not in DEAL_FLOW.get(row["stage"], set()):
                raise TransitionError(f"{row['stage']} -> {stage} is not allowed")
            paid_at = _now() if stage == "paid" else ""
            self._db.execute("UPDATE deals SET stage = ?, paid_at = ?, updated_at = ? WHERE id = ?",
                             (stage, paid_at, _now(), deal_id))
            self._write_audit(actor, "deal.move", "deal", str(deal_id), f"{row['stage']} -> {stage}")
        return self.get_deal(deal_id)

    def get_deal(self, deal_id: int) -> dict:
        with self._lock:
            row = self._db.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
        if row is None:
            raise KeyError(f"no deal {deal_id}")
        return dict(row)

    def list_deals(self, *stages: str) -> list[dict]:
        sql, args = "SELECT * FROM deals", []
        if stages:
            sql += f" WHERE stage IN ({', '.join('?' * len(stages))})"
            args += stages
        with self._lock:
            return [dict(r) for r in self._db.execute(sql + " ORDER BY updated_at DESC, id DESC", args)]

    def _check_deal_fields(self, fields: dict) -> None:
        unknown = set(fields) - self._DEAL_FIELDS
        if unknown:
            raise ValueError(f"unknown deal field(s): {', '.join(sorted(unknown))}")

    # --- assistant actions waiting for the owner's click ----------------------
    def add_pending(self, pending_id: str, tool: str, args: dict, summary: str, expires_at: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO pending_actions (id, tool, args, summary, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
                (pending_id, tool, json.dumps(args), summary, _now(), expires_at),
            )
            self._write_audit("assistant", "tool.pending", "tool", tool, summary)

    def take_pending(self, pending_id: str) -> dict | None:
        """Claim a pending action exactly once. None if it is unknown, used or cancelled."""
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT * FROM pending_actions WHERE id = ? AND status = 'pending'", (pending_id,)).fetchone()
            if row is None:
                return None
            self._db.execute("UPDATE pending_actions SET status = 'used' WHERE id = ?", (pending_id,))
            return {**dict(row), "args": json.loads(row["args"])}

    def cancel_pending(self, pending_id: str) -> bool:
        with self._lock, self._db:
            cur = self._db.execute(
                "UPDATE pending_actions SET status = 'cancelled' WHERE id = ? AND status = 'pending'", (pending_id,))
            if cur.rowcount:
                self._write_audit("user", "tool.cancel", "pending", pending_id)
            return bool(cur.rowcount)

    # --- small key-value settings (cursors) ----------------------------------
    def get_value(self, key: str, default: str = "") -> str:
        with self._lock:
            row = self._db.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_value(self, key: str, value: str) -> None:
        with self._lock, self._db:
            self._db.execute("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                             (key, value))

    # --- interviews (opaque JSON state owned by interview.py) ---------------
    def save_interview(self, interview_id: str, state: str) -> None:
        with self._lock, self._db:
            self._db.execute(
                "INSERT INTO interviews (id, state, updated_at) VALUES (?, ?, ?)"
                " ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
                (interview_id, state, _now()),
            )

    def load_interview(self, interview_id: str) -> str:
        with self._lock:
            row = self._db.execute("SELECT state FROM interviews WHERE id = ?", (interview_id,)).fetchone()
        if row is None:
            raise KeyError(f"no interview {interview_id}")
        return row["state"]

    # --- reports ----------------------------------------------------------
    def save_report(self, kind: str, report_date: str, subject: str, body: str, recipient: str) -> int:
        """One archived report per (kind, date); saving again refreshes its text."""
        with self._lock, self._db:
            row = self._db.execute(
                "SELECT id FROM reports WHERE kind = ? AND report_date = ?", (kind, report_date)).fetchone()
            if row:
                self._db.execute("UPDATE reports SET subject = ?, body = ?, recipient = ? WHERE id = ?",
                                 (subject, body, recipient, row["id"]))
                return row["id"]
            cur = self._db.execute(
                "INSERT INTO reports (kind, report_date, subject, body, recipient, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (kind, report_date, subject, body, recipient, _now()),
            )
            return cur.lastrowid

    def mark_report_sent(self, report_id: int) -> None:
        with self._lock, self._db:
            self._db.execute("UPDATE reports SET sent_at = ?, delivery_error = '' WHERE id = ?", (_now(), report_id))

    def mark_report_unsent(self, report_id: int, error: str) -> None:
        with self._lock, self._db:
            self._db.execute("UPDATE reports SET delivery_error = ? WHERE id = ?", (error[:300], report_id))

    def list_reports(self, kind: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM reports", ()
        if kind:
            sql, args = sql + " WHERE kind = ?", (kind,)
        with self._lock:
            return [dict(r) for r in self._db.execute(sql + " ORDER BY id DESC", args)]

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
