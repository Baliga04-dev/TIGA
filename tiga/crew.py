"""The crew cycle: Manager -> Dev -> Tester, returned as one auditable report.

Interface: `await run_agent_cycle() -> dict`. The Tester imports the app and runs the backend
pytest suite (skipped when TIGA_TESTER_CHILD is set, so a test run never recurses).
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_agent_cycle() -> dict[str, Any]:
    """Run manager -> dev -> tester and return a single auditable report."""
    manager = _manager_report()
    dev = _dev_report()
    tester = await _tester_report()
    report = {
        "ok": tester["ok"],
        "run_at": _now(),
        "manager": manager,
        "dev": dev,
        "tester": tester,
        "flow": ["manager", "dev", "tester"],
    }
    return report


def _manager_report() -> dict[str, Any]:
    return {
        "agent": "manager",
        "status": "ready",
        "responsibilities": [
            "triage bugs and improvements",
            "coordinate dev and tester",
            "prepare the daily report",
        ],
        "next_actions": [
            "Review tester findings",
            "Approve changes before production sync",
            "Send the daily report when Gmail is configured",
        ],
    }


def _dev_report() -> dict[str, Any]:
    return {
        "agent": "dev",
        "status": "ready",
        "responsibilities": [
            "implement approved changes",
            "keep the working tree and GitHub repository aligned",
            "never push secrets or unreviewed generated changes",
        ],
    }


async def _tester_report() -> dict[str, Any]:
    checks = [await asyncio.to_thread(_run_backend_check)]
    suite = await asyncio.to_thread(_run_test_suite)
    if suite:
        checks.append(suite)
    ok = all(check["ok"] for check in checks)
    return {
        "agent": "tester",
        "ok": ok,
        "status": "passed" if ok else "failed",
        "checks": checks,
    }


def _run_backend_check() -> dict[str, Any]:
    try:
        import main  # noqa: F401

        return {"name": "backend_import", "ok": True, "detail": "FastAPI import succeeded"}
    except Exception as exc:
        return {"name": "backend_import", "ok": False, "detail": f"{type(exc).__name__}: {exc}"}


def _run_test_suite() -> dict[str, Any] | None:
    """Run the backend pytest suite; skipped inside a test run to avoid recursion."""
    backend_dir = Path(__file__).parent
    if os.environ.get("TIGA_TESTER_CHILD") or not (backend_dir / "tests").is_dir():
        return None
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-x", "--no-header"],
            cwd=backend_dir,
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "TIGA_TESTER_CHILD": "1"},
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"name": "backend_tests", "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
    tail = (proc.stdout or proc.stderr).strip().splitlines()[-1:] or [""]
    return {"name": "backend_tests", "ok": proc.returncode == 0, "detail": tail[0]}
