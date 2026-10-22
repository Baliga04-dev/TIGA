from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from when import parse_when

IST = ZoneInfo("Asia/Kolkata")
NOW = datetime(2026, 10, 22, 14, 10, tzinfo=IST)  # Thursday 2:10 pm


@pytest.mark.parametrize("text, expected", [
    ("in 20 minutes", datetime(2026, 10, 22, 14, 30, tzinfo=IST)),
    ("in an hour", datetime(2026, 10, 22, 15, 10, tzinfo=IST)),
    ("in 2 hours", datetime(2026, 10, 22, 16, 10, tzinfo=IST)),
    ("at 5", datetime(2026, 10, 22, 17, 0, tzinfo=IST)),          # small hours mean afternoon
    ("at 5pm", datetime(2026, 10, 22, 17, 0, tzinfo=IST)),
    ("at 10 am", datetime(2026, 10, 23, 10, 0, tzinfo=IST)),      # already past today
    ("at 17:30", datetime(2026, 10, 22, 17, 30, tzinfo=IST)),
    ("at 9:15 pm", datetime(2026, 10, 22, 21, 15, tzinfo=IST)),
    ("tomorrow 10am", datetime(2026, 10, 23, 10, 0, tzinfo=IST)),
    ("tomorrow at 9", datetime(2026, 10, 23, 9, 0, tzinfo=IST)),
    ("tonight at 8", datetime(2026, 10, 22, 20, 0, tzinfo=IST)),
    ("tomorrow", datetime(2026, 10, 23, 9, 0, tzinfo=IST)),       # a bare day means 9 am
])
def test_common_phrases(text, expected):
    assert parse_when(text, NOW) == expected


@pytest.mark.parametrize("text", ["", "someday", "at 25", "in -5 minutes", "at 13pm"])
def test_unclear_times_are_none(text):
    assert parse_when(text, NOW) is None
