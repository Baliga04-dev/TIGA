import httpx

import sitecheck

OLD = """<html><head><title>Sri Bakery</title></head><body>
<p>Call us!</p><a href="/contact-us">Contact</a><footer>(c) 2016 Sri Bakery</footer></body></html>"""
CONTACT = """<html><body>Write to <a href="mailto:Orders@SriBakery.in?subject=hi">us</a> or
info@sribakery.in. Logo: logo@2x.png  tracking: abc@sentry.io</body></html>"""
MODERN = """<html><head><meta name="viewport" content="width=device-width"></head>
<body>hello@modern.in <footer>&copy; 2026 Modern</footer></body></html>"""


async def test_finds_published_emails_on_the_contact_page_and_lists_problems(http):
    http.add("sribakery.in/robots.txt", status=404, text="")
    http.add("sribakery.in/contact-us", text=CONTACT)
    http.add("sribakery.in", text=OLD)
    report = await sitecheck.inspect("http://sribakery.in", year=2026)
    assert report.reachable and not report.https
    assert [e for e, _ in report.emails] == ["orders@sribakery.in", "info@sribakery.in"]
    assert report.emails[0][1].endswith("/contact-us")
    assert set(report.problems) >= {"no_https", "not_mobile", "outdated"}


async def test_a_modern_site_has_no_problems(http):
    http.add("modern.in/robots.txt", text="User-agent: *\nAllow: /\n")
    http.add("modern.in", text=MODERN)
    report = await sitecheck.inspect("https://modern.in", year=2026)
    assert report.problems == [] and report.emails == [("hello@modern.in", "https://modern.in")]


async def test_robots_disallow_is_respected(http):
    http.add("private.in/robots.txt", text="User-agent: *\nDisallow: /\n")
    report = await sitecheck.inspect("https://private.in", year=2026)
    assert report.robots_blocked and report.emails == []
    assert [str(r.url) for r in http.requests] == ["https://private.in/robots.txt"]


async def test_no_solicitation_notice_is_detected(http):
    http.add("shy.in/robots.txt", status=404, text="")
    http.add("shy.in", text='<meta name="viewport" content="x">No solicitation please. ask@shy.in &copy; 2026')
    assert (await sitecheck.inspect("https://shy.in", year=2026)).no_solicit


async def test_a_dead_site_is_a_problem_not_a_crash(http):
    http.add("dead.in/robots.txt", exc=httpx.ConnectError("nope"))
    http.add("dead.in", exc=httpx.ConnectError("nope"))
    report = await sitecheck.inspect("https://dead.in", year=2026)
    assert not report.reachable and report.problems == ["site_down"]


async def test_only_web_urls_are_inspected():
    report = await sitecheck.inspect("file:///etc/passwd", year=2026)
    assert not report.reachable and report.emails == []
