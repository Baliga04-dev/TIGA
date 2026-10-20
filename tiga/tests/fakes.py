"""A fake Google API client: the only thing faked in Gmail tests."""
import base64


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


def raw_message(id, subject, body, sender="Alex <alex@acme.com>", html=None, headers=None):
    """Build a Gmail 'full' message dict like the real API returns."""
    parts = [{"mimeType": "text/plain", "body": {"data": b64(body)}}]
    if html is not None:
        parts.insert(0, {"mimeType": "text/html", "body": {"data": b64(html)}})
    hdrs = headers or [
        {"name": "Subject", "value": subject},
        {"name": "From", "value": sender},
        {"name": "To", "value": "me@example.com"},
        {"name": "Date", "value": "Mon, 20 Oct 2026 10:00:00 +0000"},
    ]
    return {
        "id": id,
        "threadId": f"t-{id}",
        "snippet": body[:40],
        "labelIds": ["INBOX"],
        "payload": {"mimeType": "multipart/alternative", "headers": hdrs, "parts": parts},
    }


class _Call:
    def __init__(self, fn):
        self._fn = fn

    def execute(self):
        return self._fn()


class FakeGoogleClient:
    """Mimics service.users().messages().{list,get,send}(...).execute()."""

    def __init__(self, messages=()):
        self.messages_by_id = {m["id"]: m for m in messages}
        self.sent = []
        self.list_queries = []

    def users(self):
        return self

    def messages(self):
        return self

    def list(self, userId, q="", maxResults=50, labelIds=None):
        self.list_queries.append(q)
        ids = [{"id": i} for i in list(self.messages_by_id)[:maxResults]]
        return _Call(lambda: {"messages": ids})

    def get(self, userId, id, format="full"):
        return _Call(lambda: self.messages_by_id[id])

    def send(self, userId, body):
        def run():
            self.sent.append(body)
            return {"id": f"sent-{len(self.sent)}", "threadId": "t-sent"}

        return _Call(run)
