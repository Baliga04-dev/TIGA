"""Send Tiga's approved cold mail through Claude's Gmail connector instead of Tiga's own OAuth.

Tiga still decides what may go out: `next` asks `Mailer.next_due` (approval, suppression,
footer, weekday hours, daily cap, gap) and prints the one mail to send, or nothing. Claude
sends it with the connector and reports back with `sent` or `failed`. Replies come back the
same way: `threads` lists what to read, `replies FILE` classifies them and drafts follow-ups.

    python relay.py next
    python relay.py sent ID MESSAGE_ID THREAD_ID
    python relay.py failed ID "error text"
    python relay.py threads
    python relay.py replies threads.json     # {"<thread_id>": [{"from": "...", "body": "..."}]}
    python relay.py status
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import config
import services


def _print(value) -> None:
    print(json.dumps(value, indent=2, default=str))


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    command, args = argv[0], argv[1:]
    mailer = services.get_mailer()
    if command == "next":
        _print(mailer.next_due())
    elif command == "sent" and len(args) == 3:
        _print(mailer.record_send(int(args[0]), {"ok": True, "message_id": args[1], "thread_id": args[2]}))
    elif command == "failed" and len(args) == 2:
        mailer.record_send(int(args[0]), {"ok": False, "error": args[1]})
        _print({"ok": True})
    elif command == "threads":
        _print([{"id": r["id"], "email": r["email"], "thread_id": r["thread_id"]}
                for r in mailer.store.list_outreach("sent") if r["thread_id"]])
    elif command == "replies" and len(args) == 1:
        threads = json.loads(Path(args[0]).read_text())
        changed = mailer.check_replies(lambda thread_id: threads.get(thread_id, []), own_address=config.GMAIL_USER_EMAIL)
        _print({"changed": changed, "followups_drafted": len(mailer.due_followups())})
    elif command == "status":
        _print(mailer.scorecard())
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
