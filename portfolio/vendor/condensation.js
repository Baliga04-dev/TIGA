/*
 * Rain on glass, ported from ThreeUI's CondensationBackground (condensationRenderer.ts).
 * ThreeUI Community, Copyright (c) 2026 Meng To, MIT License: https://github.com/MengTo/threeui
 * Changes: plain JavaScript, drop colours tinted to catch warm street light, no React wrapper.
 */
export function createCondensation(canvas, { speed = 1, dropAmount = 1 } = {}) {
  const context = canvas.getContext('2d');
  if (!context) return null;

  let width = 1, height = 1, dpr = 1, floorY = 1;
  let baseMaxDrops = 120, maxDrops = 120, lastCascade = 0, simulatedNow = 0, lastFrame = 0;
  let drops = [], splashes = [];
  const sprites = new Map();

  const sprite = (radius) => {
    const r = Math.max(0.5, Math.round(radius * 2) / 2);
    const cached = sprites.get(r);
    if (cached) return cached;
    const pad = Math.ceil(2 * dpr), size = Math.ceil(r * 2 + pad * 2);
    const s = document.createElement('canvas');
    s.width = s.height = size;
    const c = s.getContext('2d'), mid = size / 2, lit = r / (4.4 * dpr);
    c.fillStyle = `rgba(214,206,186,${0.10 + lit * 0.16})`;
    c.beginPath(); c.arc(mid, mid, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = `rgba(243,195,38,${0.18 + lit * 0.22})`;
    c.lineWidth = 0.9 * dpr; c.stroke();
    c.fillStyle = `rgba(255,248,230,${0.30 + lit * 0.32})`;
    c.beginPath(); c.arc(mid - r * 0.32, mid - r * 0.36, Math.max(0.45 * dpr, r * 0.24), 0, Math.PI * 2); c.fill();
    sprites.set(r, s);
    return s;
  };

  const seed = (headStart = 0) => {
    const m = 8 * dpr;
    drops.push({
      x: m + Math.random() * Math.max(1, width - m * 2),
      y: m + Math.random() * Math.max(1, floorY - m * 2),
      r: (0.5 + headStart * 0.7) * dpr, rMax: (2.1 + Math.random() * 2.3) * dpr,
      grow: (0.0022 + Math.random() * 0.0032) * dpr, running: false, vy: 0,
    });
  };

  const resize = (w, h) => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.width = Math.max(1, Math.floor(w * dpr));
    height = canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    floorY = Math.max(1, height - 2 * dpr);
    baseMaxDrops = Math.max(80, Math.min(240, Math.round((width * height) / (dpr * dpr) / 5200)));
    maxDrops = Math.round(baseMaxDrops * dropAmount);
    drops = []; splashes = []; sprites.clear();
    for (let i = 0; i < Math.round(maxDrops * 0.62); i += 1) seed(Math.random() * 3);
  };

  const step = (now, k) => {
    if (drops.length < maxDrops && Math.random() < 0.34 * k) seed();
    if (now - lastCascade > 6400) {
      lastCascade = now;
      drops.filter((d) => !d.running).sort((a, b) => b.r - a.r).slice(0, 3)
        .forEach((d) => { d.running = true; d.vy = 0.35 * dpr; });
    }
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      if (!d.running) {
        d.r += d.grow * k;
        if (d.r >= d.rMax) { d.running = true; d.vy = 0.3 * dpr; }
        continue;
      }
      d.vy = Math.min(d.vy + 0.075 * dpr * k, 5.4 * dpr);
      d.y += d.vy * k;
      for (let j = drops.length - 1; j >= 0; j -= 1) {
        const o = drops[j];
        if (o === d || o.running) continue;
        if (Math.abs(o.x - d.x) < d.r + o.r + 1.5 * dpr && o.y > d.y - d.r && o.y < d.y + d.vy + d.r) {
          d.r = Math.sqrt(d.r * d.r + o.r * o.r);
          drops.splice(j, 1);
          if (j < i) i -= 1;
        }
      }
      if (d.y >= floorY) { splashes.push({ x: d.x, y: floorY, r0: d.r, born: now }); drops.splice(i, 1); }
    }
    splashes = splashes.filter((s) => now - s.born < 760);
  };

  const draw = (now) => {
    context.clearRect(0, 0, width, height);
    drops.forEach((d) => { const s = sprite(d.r); context.drawImage(s, d.x - s.width / 2, d.y - s.height / 2); });
    splashes.forEach((s) => {
      const p = (now - s.born) / 760;
      if (p < 0 || p > 1) return;
      const r = s.r0 + p * 16 * dpr;
      context.strokeStyle = `rgba(243,195,38,${(1 - p) * 0.4})`;
      context.lineWidth = 1.1 * dpr;
      context.beginPath(); context.ellipse(s.x, s.y, r, r * 0.34, 0, 0, Math.PI * 2); context.stroke();
    });
  };

  return {
    resize,
    render(now) {
      const delta = lastFrame ? Math.min(50, now - lastFrame) : 16.67;
      lastFrame = now;
      simulatedNow += delta * speed;
      step(simulatedNow, speed);
      draw(simulatedNow);
    },
  };
}
