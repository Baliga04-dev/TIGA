import pytest

from store import Store, TransitionError


@pytest.fixture
def store():
    s = Store(":memory:")
    yield s
    s.close()


def test_job_runs_once_per_day(store):
    assert store.claim_job("daily_report", "2026-10-21") is True
    assert store.claim_job("daily_report", "2026-10-21") is False
    assert store.claim_job("daily_report", "2026-10-22") is True
    assert store.claim_job("weekly_rnd", "2026-10-21") is True


def test_failed_job_can_be_released_and_retried(store):
    assert store.claim_job("daily_report", "2026-10-21")
    store.release_job("daily_report", "2026-10-21")
    assert store.claim_job("daily_report", "2026-10-21") is True


def test_open_issue_dedupes_on_key_and_counts_occurrences(store):
    first = store.open_issue("bug", "Login fails", dedupe_key="t:login", source="tester")
    again = store.open_issue("bug", "Login fails", dedupe_key="t:login", source="tester")
    assert again["id"] == first["id"]
    assert again["occurrences"] == 2
    assert len(store.list_issues()) == 1


def test_issue_follows_the_state_machine_and_audits_each_step(store):
    issue = store.open_issue("improvement", "Faster inbox", dedupe_key="m:inbox", source="manager")
    assert issue["status"] == "open"
    for status in ("triaged", "approved", "in_progress", "pr_open", "tested", "done"):
        issue = store.transition_issue(issue["id"], status, actor="manager")
        assert issue["status"] == status
    actions = [a["action"] for a in store.audit_log()]
    assert actions.count("issue.transition") == 6


def test_illegal_transition_is_rejected_and_state_unchanged(store):
    issue = store.open_issue("bug", "x", dedupe_key="k", source="tester")
    with pytest.raises(TransitionError):
        store.transition_issue(issue["id"], "done", actor="dev")
    assert store.get_issue(issue["id"])["status"] == "open"


def test_dev_cannot_start_before_user_approval(store):
    issue = store.open_issue("bug", "x", dedupe_key="k", source="tester")
    store.transition_issue(issue["id"], "triaged", actor="manager")
    with pytest.raises(TransitionError):
        store.transition_issue(issue["id"], "in_progress", actor="dev")


def test_rejected_issue_reopens_as_a_new_occurrence_not_silently(store):
    issue = store.open_issue("bug", "x", dedupe_key="k", source="tester")
    store.transition_issue(issue["id"], "rejected", actor="user")
    again = store.open_issue("bug", "x", dedupe_key="k", source="tester")
    assert again["status"] == "rejected"  # the user's decision stands
    assert again["occurrences"] == 2


def test_suppression_is_case_insensitive_and_permanent(store):
    assert store.is_suppressed("Lead@Example.com") is False
    store.suppress("Lead@Example.com", reason="unsubscribe")
    assert store.is_suppressed("lead@example.COM") is True
    store.suppress("lead@example.com", reason="bounce")  # idempotent
    assert len(store.suppressions()) == 1


def test_suppressing_a_domain_covers_every_address_on_it(store):
    store.suppress("@acme.io", reason="complaint")
    assert store.is_suppressed("anyone@acme.io") is True
    assert store.is_suppressed("anyone@acme.com") is False


def test_audit_log_is_append_only_and_ordered(store):
    store.audit("user", "settings.update", "cap", "20")
    store.audit("manager", "issue.open", "issue", "1")
    log = store.audit_log()
    assert [e["actor"] for e in log] == ["user", "manager"]


def test_data_survives_reopen(tmp_path):
    path = tmp_path / "tiga.db"
    s1 = Store(str(path))
    s1.suppress("a@b.co", reason="x")
    s1.close()
    s2 = Store(str(path))
    assert s2.is_suppressed("a@b.co")
    s2.close()
