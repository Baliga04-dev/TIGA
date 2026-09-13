"use strict";

const $ = (id) => document.getElementById(id);

const S = {
  busy: false,
  speaking: false,
  listening: false,
  wantMic: false,
  history: [],
  audioCtx: null,
  elAnalyser: null,
  micAnalyser: null,
  rec: null,
  recSupported: false,
  gbVoice: null,
  level: 0,
  t0: performance.now(),
};

const orb = $("orb");
const heardEl = $("heard");
const cardsEl = $("cards");
const player = $("player");

function setState(name, label) {
  orb.className = name;
  $("stateLabel").textContent = label;
}

function setPill(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = "pill " + cls;
}

async function init() {
  try { await fetchStatus(); } catch (e) {}
  setupAudio();
  setupRecognition();
  setupVoices();
  startClock();
  requestAnimationFrame(tick);
  addCard("info", "SYSTEM", "All systems online. Awaiting your instruction.");
  setInterval(pollStatus, 30000);
}

async function fetchStatus() {
  const res = await fetch("/api/status");
  applyStatus(await res.json());
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status");
    if (res.ok) applyStatus(await res.json());
  } catch (e) {
    setPill("linkState", "LINK LOST", "pill-dim");
  }
}

function applyStatus(st) {
  $("sysMode").textContent =
    st.brain === "openai" ? "OPENAI LINKED" : "DEMO CORE";
  setPill(
    "linkState",
    st.metrics_endpoint || st.booking_webhook ? "LIVE WIRED" : "DEMO DATA",
    st.metrics_endpoint || st.booking_webhook ? "pill-on" : "pill-hot"
  );
}

function startClock() {
  const tickClock = () => {
    $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
  };
  tickClock();
  setInterval(tickClock, 1000);
}

function setupAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  S.audioCtx = new Ctx();
  try {
    const src = S.audioCtx.createMediaElementSource(player);
    S.elAnalyser = S.audioCtx.createAnalyser();
    S.elAnalyser.fftSize = 1024;
    src.connect(S.elAnalyser);
    S.elAnalyser.connect(S.audioCtx.destination);
  } catch (e) {}
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (!S.audioCtx) return;
      const micSrc = S.audioCtx.createMediaStreamSource(stream);
      S.micAnalyser = S.audioCtx.createAnalyser();
      S.micAnalyser.fftSize = 1024;
      micSrc.connect(S.micAnalyser);
      $("micBtn").disabled = false;
      setPill("micState", "MIC READY", "pill-on");
    })
    .catch(() => {
      setPill("micState", "MIC DENIED", "pill-dim");
      $("micBtn").title = "Microphone permission denied - use the text box";
    });
}

function setupVoices() {
  if (!("speechSynthesis" in window)) return;
  const pick = () => {
    const voices = speechSynthesis.getVoices();
    S.gbVoice =
      voices.find((v) => v.lang === "en-GB" && /male|daniel|ryan|arthur/i.test(v.name)) ||
      voices.find((v) => v.lang === "en-GB") ||
      voices.find((v) => v.lang && v.lang.startsWith("en")) ||
      null;
  };
  pick();
  speechSynthesis.onvoiceschanged = pick;
}

function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("micBtn").disabled = true;
    $("micBtn").title = "Speech recognition unsupported in this browser";
    return;
  }
  S.recSupported = true;
  const rec = new SR();
  rec.lang = "en-GB";
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    S.listening = true;
    $("micBtn").classList.add("active");
    setPill("micState", "LISTENING", "pill-hot");
    if (!S.busy && !S.speaking) setState("listening", "LISTENING");
    heardEl.textContent = "Listening…";
    heardEl.classList.add("interim");
  };

  rec.onresult = (ev) => {
    let interim = "";
    let final = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final.trim()) {
      heardEl.classList.remove("interim");
      handleCommand(final.trim(), "VOICE");
    } else if (interim) {
      heardEl.textContent = interim;
    }
  };

  rec.onerror = (ev) => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      S.wantMic = false;
      setPill("micState", "MIC BLOCKED", "pill-dim");
    }
  };

  rec.onend = () => {
    S.listening = false;
    $("micBtn").classList.remove("active");
    setPill("micState", S.wantMic ? "MIC ON" : "MIC OFF", S.wantMic ? "pill-on" : "pill-dim");
    if (!S.busy && !S.speaking) setState("idle", "STANDBY");
    if (S.wantMic && !S.busy && !S.speaking) {
      setTimeout(() => {
        if (S.wantMic && !S.busy && !S.speaking) safeStart();
      }, 350);
    }
  };

  S.rec = rec;
  $("micBtn").addEventListener("click", toggleMic);
}

function safeStart() {
  try { S.rec.start(); } catch (e) {}
}

function toggleMic() {
  if (!S.rec) return;
  S.wantMic = !S.wantMic;
  if (S.wantMic) safeStart();
  else { try { S.rec.stop(); } catch (e) {} }
}

async function handleCommand(text, channel) {
  if (S.busy || !text) return;
  S.busy = true;
  if (channel === "VOICE") stopForReply();

  addCard("info", channel, escapeHtml(text));
  setState("thinking", "PROCESSING");
  heardEl.textContent = "Processing…";
  heardEl.classList.add("interim");

  let data;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, history: S.history }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
  } catch (e) {
    heardEl.textContent = "Connection lost.";
    heardEl.classList.remove("interim");
    setState("idle", "ERROR");
    addCard("err", "ERROR", "Backend unreachable: " + e.message);
    S.busy = false;
    resumeAfterReply();
    return;
  }

  renderActions(data.actions || []);
  S.history.push({ role: "user", content: text });
  S.history.push({ role: "assistant", content: data.reply });
  if (S.history.length > 12) S.history = S.history.slice(-12);

  heardEl.textContent = data.reply;
  heardEl.classList.remove("interim");

  await speak(data.reply);
  S.busy = false;
  resumeAfterReply();
}

function stopForReply() {
  if (S.rec && S.listening) { try { S.rec.stop(); } catch (e) {} }
}

function resumeAfterReply() {
  if (S.wantMic && S.recSupported) {
    setTimeout(() => {
      if (S.wantMic && !S.busy && !S.speaking) safeStart();
    }, 400);
  } else {
    setState("idle", "STANDBY");
  }
}

function renderActions(actions) {
  actions.forEach((a, i) => {
    const status = a.ok ? "ok" : "err";
    const src = a.result && a.result.source ? a.result.source : "";
    const detailBits = [];
    if (Object.keys(a.args || {}).length) detailBits.push("args " + JSON.stringify(a.args));
    if (a.result && a.result.error) detailBits.push(escapeHtml(a.result.error));
    const card = addCard(status, "TOOL · " + a.tool, detailBits.join("\n") || "completed");
    if (src === "demo") appendBadge(card, "src-demo", "DEMO");
    else if (src === "live") appendBadge(card, "src-live", "LIVE");
    if (a.ms) setCardMs(card, a.ms + "ms");
  });
}

function appendBadge(card, cls, text) {
  const span = document.createElement("span");
  span.className = "card-src " + cls;
  span.textContent = text;
  card.querySelector(".card-top").appendChild(span);
}

function setCardMs(card, text) {
  const span = document.createElement("span");
  span.className = "card-ms";
  span.textContent = text;
  card.querySelector(".card-top").appendChild(span);
}

function addCard(kind, title, detail) {
  const div = document.createElement("div");
  div.className = "card " + kind;
  const top = document.createElement("div");
  top.className = "card-top";
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = kind.toUpperCase();
  const ttl = document.createElement("span");
  ttl.className = "card-title";
  ttl.innerHTML = "<strong>" + escapeHtml(title) + "</strong>";
  top.appendChild(tag);
  top.appendChild(ttl);
  div.appendChild(top);
  if (detail) {
    const det = document.createElement("div");
    det.className = "card-detail";
    det.innerHTML = detail;
    div.appendChild(det);
  }
  cardsEl.prepend(div);
  while (cardsEl.children.length > 40) cardsEl.removeChild(cardsEl.lastChild);
  return div;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function speak(text) {
  if (!text) return;
  setState("speaking", "SPEAKING");
  S.speaking = true;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && (res.headers.get("content-type") || "").includes("audio")) {
      const blob = await res.blob();
      await playElement(URL.createObjectURL(blob));
      S.speaking = false;
      return;
    }
  } catch (e) {}
  await speakBrowser(text);
  S.speaking = false;
}

function playElement(url) {
  return new Promise((resolve) => {
    player.src = url;
    player.onended = () => resolve();
    player.onerror = () => resolve();
    player.play().catch(() => resolve());
  });
}

function speakBrowser(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (S.gbVoice) u.voice = S.gbVoice;
    u.rate = 0.98;
    u.pitch = 0.92;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

const waveCanvas = $("wave");
const wctx = waveCanvas.getContext("2d");

function resizeWave() {
  const dpr = window.devicePixelRatio || 1;
  waveCanvas.width = waveCanvas.clientWidth * dpr;
  waveCanvas.height = waveCanvas.clientHeight * dpr;
}
window.addEventListener("resize", resizeWave);
resizeWave();

const freqBuf = new Uint8Array(1024);
const timeBuf = new Uint8Array(1024);

function analyserLevel(analyser) {
  analyser.getByteFrequencyData(freqBuf);
  let sum = 0;
  const n = Math.min(200, freqBuf.length);
  for (let i = 0; i < n; i++) sum += freqBuf[i] * freqBuf[i];
  return Math.min(1, Math.sqrt(sum / n) / 140);
}

function drawWave(activeAnalyser) {
  const W = waveCanvas.width;
  const H = waveCanvas.height;
  wctx.clearRect(0, 0, W, H);
  const mid = H / 2;
  wctx.lineWidth = Math.max(2, H * 0.02);
  wctx.strokeStyle = "rgba(53,214,255,0.9)";
  wctx.shadowColor = "rgba(53,214,255,0.8)";
  wctx.shadowBlur = 14;
  wctx.beginPath();

  if (activeAnalyser) {
    activeAnalyser.getByteTimeDomainData(timeBuf);
    const step = timeBuf.length / Math.min(timeBuf.length, W / 3);
    for (let i = 0, x = 0; i < timeBuf.length; i += step, x += 3) {
      const v = (timeBuf[Math.floor(i)] - 128) / 128;
      const y = mid + v * mid * 0.9;
      x <= 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
    }
  } else {
    const t = (performance.now() - S.t0) / 1000;
    for (let x = 0; x < W; x += 6) {
      const p = x / W;
      const env = Math.sin(Math.PI * p);
      const y =
        mid +
        Math.sin(p * 18 + t * 2.2) * env * H * 0.06 * (1 + S.level * 2) +
        Math.sin(p * 41 - t * 3.7) * env * H * 0.03;
      x <= 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
    }
  }
  wctx.stroke();
}

function tick() {
  let active = null;

  if (S.speaking && S.elAnalyser && player.src && !player.paused) {
    S.level = S.level * 0.7 + analyserLevel(S.elAnalyser) * 0.3;
    active = S.elAnalyser;
  } else if (S.listening && S.micAnalyser) {
    S.level = S.level * 0.7 + analyserLevel(S.micAnalyser) * 0.3;
    active = S.micAnalyser;
  } else {
    S.level = S.level * 0.85;
  }

  orb.style.setProperty("--level", S.level.toFixed(3));
  drawWave(active);
  requestAnimationFrame(tick);
}

$("cmdForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("cmdInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleCommand(text, "KEYBOARD");
});

$("initBtn").addEventListener("click", async () => {
  $("gate").classList.add("gone");
  $("hud").classList.remove("hidden");
  if (S.audioCtx && S.audioCtx.state === "suspended") {
    try { await S.audioCtx.resume(); } catch (e) {}
  }
  init();
});
