// Tiga's phone remote. The pairing code arrives once in the QR link's #k=... and is kept in this phone's storage;
// every call carries it in the X-Tiga-Phone header. Nothing here can confirm an action by voice: only a tap does.
(function () {
  'use strict';
  var KEY = 'tiga.phone';
  var POLL_MS = 20000;
  var $ = function (id) { return document.getElementById(id); };
  var turns = [];   // the conversation so far, for follow-up questions
  var seenAlerts = {};
  var loaded = false;   // the first look only fills the list; later new alerts also buzz
  var paused = false;

  function code() {
    var m = /[#&]k=([\w-]+)/.exec(location.hash);
    if (m) {
      try { localStorage.setItem(KEY, m[1]); } catch (e) { /* private mode: kept for this visit only */ }
      window.__tigaCode = m[1];
      window.history.replaceState(null, '', location.pathname);   // the code leaves the address bar and the history
    }
    try { return localStorage.getItem(KEY) || window.__tigaCode || ''; } catch (e) { return window.__tigaCode || ''; }
  }

  function call(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-Tiga-Phone': code() },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    }).then(function (r) {
      if (r.status === 401) { showPaired(false); throw new Error('This phone isn\'t paired'); }
      if (r.status === 403 || r.status === 404) throw new Error('The phone remote is off on the PC');
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.detail && (data.detail[0] ? data.detail[0].msg : data.detail)) || 'Tiga said no');
        return data;
      });
    });
  }

  function setStatus(text, tone) {
    var s = $('status');
    s.textContent = text;
    s.className = 'status' + (tone ? ' ' + tone : '');
  }

  function showPaired(yes) {
    $('unpaired').hidden = yes;
    $('app').hidden = !yes;
    if (!yes) setStatus('Not paired', 'bad');
  }

  // --- replies and actions -------------------------------------------------------------------------------
  function entry(said, reply, actions, failed) {
    var li = document.createElement('li');
    li.className = 'said' + (failed ? ' failed' : '');
    var you = document.createElement('p');
    you.className = 'you';
    you.textContent = said;
    var answer = document.createElement('p');
    answer.className = 'reply';
    answer.textContent = reply;
    li.appendChild(you);
    li.appendChild(answer);
    (actions || []).forEach(function (a) {
      if (a.status !== 'needs_confirmation') return;
      var box = document.createElement('div');
      box.className = 'confirm';
      var what = document.createElement('p');
      what.textContent = 'Needs your tap: ' + a.summary.replace(/\(\)$/, '');
      var yes = button('Confirm', 'btn btn-go');
      var no = button('Cancel', 'btn btn-quiet');
      yes.addEventListener('click', function () { decide(a.pending_id, 'confirm', box); });
      no.addEventListener('click', function () { decide(a.pending_id, 'cancel', box); });
      box.appendChild(what);
      box.appendChild(yes);
      box.appendChild(no);
      li.appendChild(box);
    });
    var log = $('log');
    log.insertBefore(li, log.firstChild);
    while (log.children.length > 12) log.removeChild(log.lastChild);
    $('log-empty').hidden = true;
  }

  function button(text, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    return b;
  }

  function decide(id, how, box) {
    box.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    call('POST', '/api/phone/actions/' + encodeURIComponent(id) + '/' + how).then(function (r) {
      box.replaceChildren(text(how === 'cancel' ? 'Cancelled.' : r.ok ? 'Done.' : 'Didn\'t work: ' + (r.error || 'unknown')));
    }).catch(function (e) { box.replaceChildren(text(e.message)); });
  }

  function text(t) {
    var p = document.createElement('p');
    p.textContent = t;
    return p;
  }

  function say(words) {
    words = (words || '').trim();
    if (!words) return;
    var sendBtn = $('send');
    sendBtn.disabled = true;
    setStatus('Working…', '');
    call('POST', '/api/phone/command', { text: words, history: turns.slice(-8) }).then(function (r) {
      turns.push({ role: 'user', content: words }, { role: 'assistant', content: r.reply });
      entry(words, r.reply, r.actions);
      $('text').value = '';
      ready();
    }).catch(function (e) {
      entry(words, e.message, [], true);
      setStatus('Problem', 'bad');
    }).then(function () { sendBtn.disabled = false; refresh(); });
  }

  function press(name, btn) {
    btn.classList.add('sent');
    if (navigator.vibrate) navigator.vibrate(15);
    call('POST', '/api/phone/press', { button: name }).then(function (r) {
      if (!r.ok) entry(btn.getAttribute('aria-label'), r.error || 'That didn\'t work', [], true);
    }).catch(function (e) { setStatus(e.message, 'bad'); })
      .then(function () { setTimeout(function () { btn.classList.remove('sent'); }, 180); });
  }

  // --- what needs the owner (due reminders: a warm reply, a call to make) -------------------------------
  function refresh() {
    if (document.hidden) return;
    call('GET', '/api/phone/state').then(function (s) {
      showPaired(true);
      paused = s.paused;
      ready();
      var stop = document.querySelector('[data-say="Tiga stop"], [data-say="Resume"]');
      if (stop) {
        stop.dataset.say = paused ? 'Resume' : 'Tiga stop';
        stop.textContent = paused ? 'Resume Tiga' : 'Stop Tiga';
      }
      var list = $('alert-list');
      list.replaceChildren();
      var fresh = false;
      s.reminders.forEach(function (r) {
        if (!seenAlerts[r.id]) { seenAlerts[r.id] = true; fresh = true; }
        var li = document.createElement('li');
        li.className = 'alert';
        li.appendChild(text(r.text));
        var done = button('Done', 'btn btn-quiet');
        done.setAttribute('aria-label', 'Done: ' + r.text);
        done.addEventListener('click', function () {
          done.disabled = true;
          call('POST', '/api/phone/reminders/' + r.id + '/done').then(refresh).catch(refresh);
        });
        li.appendChild(done);
        list.appendChild(li);
      });
      $('alerts').hidden = s.reminders.length === 0;
      if (fresh && loaded && navigator.vibrate) navigator.vibrate([60, 80, 60]);
      loaded = true;
    }).catch(function (e) { if (code()) setStatus(e.message, 'bad'); });
  }

  function ready() { setStatus(paused ? 'Paused: say resume' : 'Connected', paused ? 'warn' : 'good'); }

  // --- voice, where the browser allows it (a secure page); otherwise the keyboard's mic works everywhere ---
  function voice() {
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec || !window.isSecureContext) return;
    var talk = $('talk');
    var rec = null;
    talk.hidden = false;
    $('mic-hint').textContent = 'Hold the button and speak, or use your keyboard\'s microphone.';
    function start(e) {
      e.preventDefault();
      rec = new Rec();
      rec.lang = 'en-IN';
      rec.interimResults = false;
      rec.onresult = function (ev) { say(ev.results[0][0].transcript); };
      rec.onend = function () { talk.classList.remove('live'); talk.textContent = 'Hold to talk'; };
      talk.classList.add('live');
      talk.textContent = 'Listening…';
      rec.start();
    }
    function stop() { if (rec) rec.stop(); }
    talk.addEventListener('pointerdown', start);
    talk.addEventListener('pointerup', stop);
    talk.addEventListener('pointerleave', stop);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!code()) { showPaired(false); return; }
    document.querySelectorAll('[data-press]').forEach(function (b) {
      b.addEventListener('click', function () { press(b.dataset.press, b); });
    });
    document.querySelectorAll('[data-say]').forEach(function (b) {
      b.addEventListener('click', function () { say(b.dataset.say); });
    });
    $('ask').addEventListener('submit', function (e) { e.preventDefault(); say($('text').value); });
    $('text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say($('text').value); }
    });
    voice();
    refresh();
    setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
  });
})();
