
/* =====================================================================
   A Bengaluru shop street, after dark, for adithya's portfolio.
   Adapted from "Kage" in ThreeUI by Meng To (MIT License, Copyright (c)
   2026 Meng To, https://github.com/MengTo/threeui): the renderer, the
   procedural textures, the camera rig, the post pass and the page wiring
   are his; the street, its shops, boards, arch, lamps and autos are new.
   ===================================================================== */
(function () {
'use strict';

/* ------------------------------------------------------------ 0 · basics */
const Q      = new URLSearchParams(location.search);
const qs     = (k, d) => { const v = Q.get(k); return v === null ? d : v; };
const qn     = (k, d) => { const v = Q.get(k); return v === null ? d : parseFloat(v); };
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(hover: none)').matches;

const clamp  = (v, a, b) => v < a ? a : (v > b ? b : v);
const sat    = v => clamp(v, 0, 1);
const lerp   = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeOut= t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TAU    = Math.PI * 2;
/* frame-rate independent damping */
const damp   = (cur, to, rate, dt) => lerp(cur, to, 1 - Math.exp(-rate * dt));

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* classic 2-D gradient noise */
function noise2D(seed) {
  const rnd = mulberry32(seed), p = new Uint8Array(256), perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255, xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const g = (h, dx, dy) => { const q = G[h & 7]; return q[0] * dx + q[1] * dy; };
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u),
                lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u), v);
  };
}
function fbm(n, x, y, oct, lac, gain) {
  let a = .5, f = 1, s = 0, m = 0;
  for (let i = 0; i < (oct || 4); i++) { s += a * n(x * f, y * f); m += a; a *= (gain || .5); f *= (lac || 2); }
  return s / m;                                    /* −1 … 1 */
}

/* ------------------------------------------------------------ 1 · canvas */
function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const hex = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';

/* stacked, up-scaled value noise — 30× faster than a per-pixel fbm and
   indistinguishable once it is multiplied under a dark base colour */
function fbmCanvas(W, H, seed, octaves, baseCells, contrast) {
  const out = cvs(W, H), o = out.getContext('2d');
  o.fillStyle = '#808080'; o.fillRect(0, 0, W, H);
  let cells = baseCells || 3, alpha = 1;
  for (let i = 0; i < (octaves || 5); i++) {
    const n = cvs(cells, cells), nx = n.getContext('2d');
    const im = nx.createImageData(cells, cells), d = im.data, r = mulberry32(seed + i * 977);
    for (let k = 0; k < cells * cells; k++) {
      const v = 128 + (r() - .5) * 255 * (contrast || 1);
      d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = clamp(v, 0, 255); d[k * 4 + 3] = 255;
    }
    nx.putImageData(im, 0, 0);
    o.globalAlpha = alpha;
    o.globalCompositeOperation = i === 0 ? 'source-over' : 'overlay';
    o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
    o.drawImage(n, 0, 0, W, H);
    cells *= 2; alpha *= .62;
  }
  o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
  return out;
}

/* height → tangent-space normal map (blur first, then Sobel) */
function normalFromHeight(hc, strength) {
  const W = hc.width, H = hc.height;
  const b = cvs(W, H), bx = b.getContext('2d');
  bx.filter = 'blur(1.1px)'; bx.drawImage(hc, 0, 0); bx.filter = 'none';
  const src = bx.getImageData(0, 0, W, H).data;
  const out = cvs(W, H), ox = out.getContext('2d');
  const im = ox.createImageData(W, H), d = im.data;
  const at = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const s = strength || 2.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = (at(x + 1, y) - at(x - 1, y)) * s;
    const gy = (at(x, y + 1) - at(x, y - 1)) * s;
    let nx = -gx, ny = gy, nz = 1;
    const il = 1 / Math.hypot(nx, ny, nz);
    const i = (y * W + x) * 4;
    d[i]     = (nx * il * .5 + .5) * 255;
    d[i + 1] = (ny * il * .5 + .5) * 255;
    d[i + 2] = (nz * il * .5 + .5) * 255;
    d[i + 3] = 255;
  }
  ox.putImageData(im, 0, 0);
  return out;
}

/* ------------------------------------------------------- 2 · surfaces */
/* long, wet, board-formed concrete — the sanctuary walls */
function texWall() {
  const W = 1024, H = 1024;
  const c = cvs(W, H), x = c.getContext('2d');
  x.fillStyle = '#10161a'; x.fillRect(0, 0, W, H);

  /* mottling */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .82;
  x.drawImage(fbmCanvas(W, H, 41, 6, 3, 1), 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* board-form seams every sixth */
  const rnd = mulberry32(7);
  for (let i = 1; i < 6; i++) {
    const y = (H / 6) * i;
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, y - 1.5, W, 3);
    x.fillStyle = 'rgba(190,205,205,.05)'; x.fillRect(0, y + 2, W, 2);
  }
  /* form-tie dimples */
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const cx2 = (W / 4) * (j + .5) + (rnd() - .5) * 14, cy = (H / 6) * (i + .5);
    const g = x.createRadialGradient(cx2, cy, 1, cx2, cy, 11);
    g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(.7, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx2, cy, 11, 0, TAU); x.fill();
  }
  /* rain streaks running the full height */
  for (let i = 0; i < 190; i++) {
    const sx = rnd() * W, w = .6 + rnd() * 3.4, top = rnd() * H * .5, len = H * (.4 + rnd() * .7);
    const g = x.createLinearGradient(0, top, 0, top + len);
    const dark = rnd() > .45;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(.25, dark ? 'rgba(0,0,0,.20)' : 'rgba(170,195,200,.045)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, top, w, len);
  }
  /* fine tooth */
  x.globalAlpha = .16; x.globalCompositeOperation = 'overlay';
  x.drawImage(fbmCanvas(512, 512, 91, 3, 128, 1.4), 0, 0, W, H);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* height for the normal map: seams + streaks only */
  const h = cvs(W, H), hx = h.getContext('2d');
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  hx.globalAlpha = .5; hx.drawImage(fbmCanvas(W, H, 41, 5, 6, 1), 0, 0); hx.globalAlpha = 1;
  for (let i = 1; i < 6; i++) { hx.fillStyle = '#2a2a2a'; hx.fillRect(0, (H / 6) * i - 2, W, 4); }
  return { map: c, normal: normalFromHeight(h, 2.0) };
}

/* wet slate paving — big slabs, tight joints, standing water */
function texFloor() {
  const W = 1024, H = 1024;
  const c = cvs(W, H), x = c.getContext('2d');
  const rnd = mulberry32(23);
  x.fillStyle = '#0a0f12'; x.fillRect(0, 0, W, H);
  const N = 4, S = W / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const t = .82 + rnd() * .36;
    x.fillStyle = hex(12 * t, 17 * t, 20 * t);
    x.fillRect(i * S + 1.5, j * S + 1.5, S - 3, S - 3);
  }
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .55;
  x.drawImage(fbmCanvas(W, H, 63, 6, 4, 1), 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  /* joints */
  x.strokeStyle = 'rgba(0,0,0,.72)'; x.lineWidth = 3;
  for (let i = 0; i <= N; i++) {
    x.beginPath(); x.moveTo(i * S, 0); x.lineTo(i * S, H); x.stroke();
    x.beginPath(); x.moveTo(0, i * S); x.lineTo(W, i * S); x.stroke();
  }
  /* height map: joints recessed, grain */
  const h = cvs(W, H), hx = h.getContext('2d');
  hx.fillStyle = '#8c8c8c'; hx.fillRect(0, 0, W, H);
  hx.globalAlpha = .35; hx.drawImage(fbmCanvas(W, H, 63, 5, 8, 1), 0, 0); hx.globalAlpha = 1;
  hx.strokeStyle = '#303030'; hx.lineWidth = 5;
  for (let i = 0; i <= N; i++) {
    hx.beginPath(); hx.moveTo(i * S, 0); hx.lineTo(i * S, H); hx.stroke();
    hx.beginPath(); hx.moveTo(0, i * S); hx.lineTo(W, i * S); hx.stroke();
  }
  /* roughness: mostly glass, drier patches where the rain missed */
  const r = cvs(512, 512), rx = r.getContext('2d');
  rx.fillStyle = '#1c1c1c'; rx.fillRect(0, 0, 512, 512);
  rx.globalAlpha = .95; rx.globalCompositeOperation = 'lighten';
  rx.drawImage(fbmCanvas(512, 512, 77, 4, 3, 1.5), 0, 0);
  rx.globalAlpha = 1; rx.globalCompositeOperation = 'source-over';
  return { map: c, normal: normalFromHeight(h, 1.5), rough: r };
}

/* --------------------------------------------------- temple timber · cedar
   Boards, not a noise field. Three things make sawn wood read as wood and
   none of them is fbm:

     1 · ring geometry. A plank is a flat cut through a round log, so the
         rings meet the face as two branches either side of the pith, and
         wherever the cut runs shallow across a ring the branches close into
         the cathedral arch everyone recognises. Solving the circle for it —
         x = pith ± √(r² − d(y)²), with the cut depth d wandering down the
         board — hands over the arches for free. Drawn strokes only ever give
         stripes, which is what the first pass here did, and stripes on a
         column read as brushed metal.
     2 · the boards themselves. Joints, and a different tone on either side of
         one. A wall with no joint in it is a wall of plastic.
     3 · pores, so the face has tooth rather than a painted finish.

   Broad fbm overlays used to do the work here and they are exactly why the
   hall looked like it was standing under a cloud: at this camera distance a
   noise blotch is dirt, and dirt is not grain. Everything below is structure.

   boards:0 gives a single timber for the columns, sills and rails, which are
   each one stick of wood and must not carry a joint. */
function texWood(seed, opt) {
  const o = opt || {}, W = 512, H = 512;
  const c = cvs(W, H), x = c.getContext('2d');
  const h = cvs(W, H), hx = h.getContext('2d');
  const r = cvs(W, H), rx = r.getContext('2d');
  const rnd = mulberry32(seed || 3);
  const base = o.base || [30, 23, 19];
  x.fillStyle = hex(base[0], base[1], base[2]); x.fillRect(0, 0, W, H);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  rx.fillStyle = o.rough || '#d6d6d6'; rx.fillRect(0, 0, W, H);

  /* board layout — widths jittered, then normalised so the run closes on the
     tile edge and the map still wraps */
  const nb = o.boards === undefined ? 7 : o.boards;
  const cuts = [0];
  if (nb > 0) {
    const ws = []; let sum = 0;
    for (let i = 0; i < nb; i++) { const v = .70 + rnd() * .60; ws.push(v); sum += v; }
    let acc = 0;
    ws.forEach(v => { acc += v / sum * W; cuts.push(acc); });
  } else cuts.push(W);

  const stroke = (pts, ctx, style, w) => {
    if (pts.length < 2) return;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
  };

  for (let b = 0; b < cuts.length - 1; b++) {
    const x0 = cuts[b], x1 = cuts[b + 1], bw = x1 - x0;
    /* every board came off a different part of the log */
    const tone = .80 + rnd() * .44;
    const pith = x0 + bw * (rnd() * 2.8 - .9);        /* usually outside it */
    const d0 = bw * (.12 + rnd() * 1.7);              /* how deep the cut ran */
    const amp = bw * (.10 + rnd() * .40);
    const per = 1 + ((rnd() * 2) | 0), ph = rnd() * TAU;
    const dAt = y => d0 + Math.sin(y / H * TAU * per + ph) * amp;
    const gap = 2.4 + rnd() * 5.0;                    /* ring spacing */

    [x, hx, rx].forEach(d => { d.save(); d.beginPath(); d.rect(x0, 0, bw, H); d.clip(); });
    x.fillStyle = hex(base[0] * tone, base[1] * tone, base[2] * tone);
    x.fillRect(x0, 0, bw, H);

    for (let k = 1; k * gap < bw * 3.4 + d0 + amp; k++) {
      const rr = k * gap * (.88 + rnd() * .24);
      const dark = .42 + rnd() * .38, wide = .8 + rnd() * 1.9;
      for (const side of [-1, 1]) {
        let pts = [];
        const flush = () => {
          /* latewood: a narrow dark band, with the pale earlywood just inside */
          stroke(pts, x, 'rgba(0,0,0,' + dark.toFixed(2) + ')', wide);
          stroke(pts, hx, 'rgba(0,0,0,' + (dark * .8).toFixed(2) + ')', wide);
          stroke(pts.map(q => [q[0] + side * (wide + .6), q[1]]), x,
                 'rgba(150,120,96,' + (dark * .30).toFixed(2) + ')', wide * .7);
          pts = [];
        };
        for (let y = -3; y <= H + 3; y += 3) {
          const d = dAt(y), q = rr * rr - d * d;
          if (q <= 0) { flush(); continue; }
          pts.push([pith + side * Math.sqrt(q), y]);
        }
        flush();
      }
    }
    /* pores — the open tooth of cedar, elongated along the grain */
    for (let i = 0; i < 220; i++) {
      const px2 = x0 + rnd() * bw, py = rnd() * H, ln = 1.5 + rnd() * 6;
      x.fillStyle = 'rgba(0,0,0,' + (.10 + rnd() * .22) + ')';
      x.fillRect(px2, py, .7 + rnd() * .7, ln);
      hx.fillStyle = 'rgba(0,0,0,.22)'; hx.fillRect(px2, py, .8, ln);
    }
    /* the odd knot, where a branch left the trunk */
    if (rnd() > .55) {
      const kx = x0 + bw * (.2 + rnd() * .6), ky = rnd() * H, kr = 2.5 + rnd() * 5;
      for (let i = 5; i >= 1; i--) {
        const t = i / 5;
        x.strokeStyle = 'rgba(0,0,0,' + (.5 - t * .25).toFixed(2) + ')'; x.lineWidth = 1.1;
        x.beginPath(); x.ellipse(kx, ky, kr * t * 1.5, kr * t * 2.4, 0, 0, TAU); x.stroke();
        hx.strokeStyle = 'rgba(0,0,0,.30)'; hx.lineWidth = 1.1;
        hx.beginPath(); hx.ellipse(kx, ky, kr * t * 1.5, kr * t * 2.4, 0, 0, TAU); hx.stroke();
      }
    }
    /* checking: the splits a dried board opens, always along the grain */
    for (let i = 0; i < 5; i++) {
      const sx = x0 + rnd() * bw, sy = rnd() * H, ln = 20 + rnd() * 120;
      const pts = [];
      for (let y = sy; y < sy + ln; y += 6) pts.push([sx + Math.sin(y * .07) * 1.4, y]);
      stroke(pts, x, 'rgba(0,0,0,.62)', .7 + rnd() * 1.2);
      stroke(pts, hx, 'rgba(0,0,0,.55)', .7 + rnd() * 1.2);
    }
    [x, hx, rx].forEach(d => d.restore());

    /* the joint, and the board edge that catches light beside it */
    if (nb > 0) {
      x.fillStyle = 'rgba(0,0,0,.80)'; x.fillRect(x1 - 1.1, 0, 2.2, H);
      x.fillStyle = 'rgba(158,130,106,.14)'; x.fillRect(x1 + 1.1, 0, 1.1, H);
      hx.fillStyle = 'rgba(0,0,0,.85)'; hx.fillRect(x1 - 1.3, 0, 2.6, H);
      hx.fillStyle = 'rgba(255,255,255,.35)'; hx.fillRect(x1 + 1.3, 0, 1.6, H);
      rx.fillStyle = 'rgba(255,255,255,.5)'; rx.fillRect(x1 - 1.6, 0, 3.2, H);
    }
  }

  /* soot, running down the boards rather than pooling in clouds — this is the
     one weathering pass, and it follows the grain because water does */
  for (let i = 0; i < 90; i++) {
    const sx = rnd() * W, top = rnd() * H, ln = H * (.15 + rnd() * .5);
    const g = x.createLinearGradient(0, top, 0, top + ln);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(.3, 'rgba(0,0,0,' + (.10 + rnd() * .16) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, top, .8 + rnd() * 3.4, ln);
  }
  return { map: c, normal: normalFromHeight(h, o.relief || 2.4), rough: r };
}

/* ------------------------------------------------------------ cut granite
   The lanterns are carved out of one block, so this is a monolith face and
   not coursed masonry: no joints, no bond pattern. What sells it instead is
   grain and wear —

     1 · the speckle. Three mineral populations at three tones: pale feldspar,
         mid quartz, black mica. A granite without visible crystal is grey
         plastic, and it is the one thing a colour ramp cannot fake.
     2 · the chisel. Parallel bruising left by a point on a dressed face, each
         mark a dark gouge with a lit shoulder below it.
     3 · pitting and fracture, and moss keyed to *those* — moss grows where
         water sits, which is the low ground, so it is read out of the height
         field rather than dropped on as its own cloud. That cloud is what
         made this look like weather rather than stone. */
function texStone(seed, opt) {
  const o = opt || {}, W = 512, H = 512;
  const c = cvs(W, H), x = c.getContext('2d');
  const h = cvs(W, H), hx = h.getContext('2d');
  const r = cvs(W, H), rx = r.getContext('2d');
  const rnd = mulberry32(seed || 17);
  const base = o.base || [46, 51, 53];
  x.fillStyle = hex(base[0], base[1], base[2]); x.fillRect(0, 0, W, H);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  rx.fillStyle = '#e8e8e8'; rx.fillRect(0, 0, W, H);

  /* 1 · crystal */
  const speck = (n, fill, smin, smax, hgt) => {
    for (let i = 0; i < n; i++) {
      const s = smin + rnd() * (smax - smin), px = rnd() * W, py = rnd() * H;
      x.fillStyle = fill(rnd);
      x.beginPath(); x.ellipse(px, py, s, s * (.55 + rnd() * .85), rnd() * TAU, 0, TAU); x.fill();
      if (hgt) {
        hx.fillStyle = hgt;
        hx.beginPath(); hx.ellipse(px, py, s, s * .8, 0, 0, TAU); hx.fill();
      }
    }
  };
  speck(3400, q => 'rgba(206,210,204,' + (.06 + q() * .20) + ')', .6, 2.8, 'rgba(255,255,255,.13)');
  speck(2000, q => 'rgba(126,136,134,' + (.07 + q() * .20) + ')', .8, 3.4, null);
  speck(1300, q => 'rgba(8,10,12,'     + (.14 + q() * .38) + ')', .5, 2.4, 'rgba(0,0,0,.16)');

  /* 2 · the chisel */
  for (let i = 0; i < 220; i++) {
    const py = rnd() * H, px = rnd() * W, len = 5 + rnd() * 24, ang = -.26 + rnd() * .52;
    [[x, 'rgba(0,0,0,.22)', 'rgba(210,216,212,.08)'], [hx, 'rgba(0,0,0,.34)', 'rgba(255,255,255,.26)']]
      .forEach(([d, dk, lt]) => {
        d.save(); d.translate(px, py); d.rotate(ang);
        d.fillStyle = dk; d.fillRect(0, 0, len, 1.5);
        d.fillStyle = lt; d.fillRect(0, 1.5, len, 1.0);
        d.restore();
      });
  }
  /* 3 · pitting and fracture */
  for (let i = 0; i < 260; i++) {
    const px = rnd() * W, py = rnd() * H, rr = .8 + rnd() * rnd() * 5;
    const g = x.createRadialGradient(px - rr * .3, py - rr * .3, rr * .1, px, py, rr);
    g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(.7, 'rgba(0,0,0,.16)');
    g.addColorStop(1, 'rgba(198,204,198,.10)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill();
    hx.fillStyle = 'rgba(0,0,0,.40)'; hx.beginPath(); hx.arc(px, py, rr * .8, 0, TAU); hx.fill();
  }
  for (let i = 0; i < 16; i++) {
    let px = rnd() * W, py = rnd() * H, a = rnd() * TAU;
    const pts = [[px, py]];
    for (let k = 0; k < 24; k++) {
      a += (rnd() - .5) * .9; px += Math.cos(a) * 9; py += Math.sin(a) * 9;
      pts.push([px, py]);
    }
    [[x, 'rgba(0,0,0,.46)'], [hx, 'rgba(0,0,0,.55)']].forEach(([d, st]) => {
      d.beginPath(); d.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(q => d.lineTo(q[0], q[1]));
      d.strokeStyle = st; d.lineWidth = .7 + rnd() * .9; d.stroke();
    });
  }

  /* moss, read out of the low ground of the height field */
  const hd = hx.getImageData(0, 0, W, H).data;
  const im = x.getImageData(0, 0, W, H), rm = rx.getImageData(0, 0, W, H);
  const amt = o.moss === undefined ? 1 : o.moss;
  for (let i = 0; i < W * H; i++) {
    const t = clamp((.5 - hd[i * 4] / 255) * 4.2, 0, 1) * amt;
    if (t <= 0) continue;
    const j = i * 4;
    im.data[j]     = lerp(im.data[j],     30, t * .75);
    im.data[j + 1] = lerp(im.data[j + 1], 44, t * .95);
    im.data[j + 2] = lerp(im.data[j + 2], 28, t * .85);
    /* moss is matte — through the same buffer, because a fillRect per pixel
       is a quarter of a million canvas calls and costs more than the rest of
       this generator put together */
    rm.data[j] = rm.data[j + 1] = rm.data[j + 2] = lerp(rm.data[j], 255, t * .5);
  }
  x.putImageData(im, 0, 0); rx.putImageData(rm, 0, 0);
  return { map: c, normal: normalFromHeight(h, o.relief || 3.2), rough: r };
}

/* ------------------------------------------- weathered vermilion · the gate
   Not a red cylinder. The gate is a painted timber that has stood out in the
   weather: the lacquer has crazed into a fine net, flaked off the edges back to
   the black wood underneath, and run in streaks where the rain came down it.
   So the wood is drawn first and the paint is laid over it at less than full
   coverage — the grain has to read *through* the red, which is what stops it
   looking like plastic. */
function texLacquer() {
  const W = 512, H = 512;
  const wood = texWood(131, { base: [34, 22, 17], boards: 0 });
  const c = cvs(W, H), x = c.getContext('2d');
  const h = cvs(W, H), hx = h.getContext('2d');
  const r = cvs(W, H), rx = r.getContext('2d');
  const rnd = mulberry32(5);
  x.drawImage(wood.map, 0, 0);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  rx.fillStyle = '#8c8c8c'; rx.fillRect(0, 0, W, H);   /* lacquer half-holds a sheen */

  /* the coat */
  x.globalAlpha = .80; x.fillStyle = '#7c1610'; x.fillRect(0, 0, W, H);
  x.globalAlpha = 1;
  /* pull the grain back through it */
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = .42;
  x.drawImage(wood.map, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  /* uneven pigment: the brush left it thicker in places */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .5;
  x.drawImage(fbmCanvas(W, H, 313, 5, 3, 1), 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* craquelure — a wandering net of hairline cracks in the paint film */
  for (let i = 0; i < 190; i++) {
    let px = rnd() * W, py = rnd() * H, a = rnd() * TAU;
    x.strokeStyle = 'rgba(24,8,6,' + (.28 + rnd() * .4) + ')';
    hx.strokeStyle = 'rgba(0,0,0,.42)';
    x.lineWidth = hx.lineWidth = .5 + rnd() * .7;
    x.beginPath(); hx.beginPath(); x.moveTo(px, py); hx.moveTo(px, py);
    for (let k = 0; k < 5 + rnd() * 9; k++) {
      a += (rnd() - .5) * 1.5; px += Math.cos(a) * (5 + rnd() * 9); py += Math.sin(a) * (5 + rnd() * 9);
      x.lineTo(px, py); hx.lineTo(px, py);
    }
    x.stroke(); hx.stroke();
  }

  /* flaking: islands where the coat has lifted, showing the burnt wood, each
     with the pale shoulder of paint still standing at its edge */
  for (let i = 0; i < 40; i++) {
    const px = rnd() * W, py = rnd() * H, rad = 2 + rnd() * rnd() * 17;
    const pts = [];
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU, rr = rad * (.55 + rnd() * .75);
      pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]);
    }
    const path = d => {
      d.beginPath(); d.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k], q = pts[(k + 1) % pts.length];
        d.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      d.closePath();
    };
    x.save(); path(x); x.clip(); x.drawImage(wood.map, 0, 0);
    x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, 0, W, H); x.restore();
    path(x); x.strokeStyle = 'rgba(196,110,76,.30)'; x.lineWidth = 1.2; x.stroke();
    path(hx); hx.fillStyle = 'rgba(0,0,0,.34)'; hx.fill();
    hx.strokeStyle = 'rgba(255,255,255,.30)'; hx.lineWidth = 1.6; hx.stroke();
    path(rx); rx.fillStyle = 'rgba(240,240,240,.75)'; rx.fill();   /* bare wood, matte */
  }

  /* rain running down the column */
  for (let i = 0; i < 120; i++) {
    const sx = rnd() * W, w = .6 + rnd() * 2.6, top = rnd() * H, len = H * (.2 + rnd() * .6);
    const g = x.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(.3, rnd() > .5 ? 'rgba(12,4,4,.24)' : 'rgba(210,150,120,.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(sx, top, w, len);
  }
  rx.globalAlpha = .6; rx.globalCompositeOperation = 'multiply';
  rx.drawImage(fbmCanvas(W, H, 401, 4, 6, 1.2), 0, 0);
  rx.globalAlpha = 1; rx.globalCompositeOperation = 'source-over';
  return { map: c, normal: normalFromHeight(h, 2.2), rough: r };
}

/* the shoji screen the sun burns through */
function texShoji() {
  const W = 1024, H = 768, c = cvs(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(228,222,206,.055)'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(10,8,7,.88)';
  const cols = 12, rows = 9;
  x.lineWidth = 5;
  for (let i = 1; i < cols; i++) { x.beginPath(); x.moveTo(W / cols * i, 0); x.lineTo(W / cols * i, H); x.stroke(); }
  for (let j = 1; j < rows; j++) { x.beginPath(); x.moveTo(0, H / rows * j); x.lineTo(W, H / rows * j); x.stroke(); }
  x.lineWidth = 13; x.strokeStyle = 'rgba(8,6,5,.95)';
  x.strokeRect(0, 0, W, H);
  x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
  return c;
}

/* one maple leaf, white on transparent — tinted per instance */
function texLeaf() {
  const S = 128, c = cvs(S, S), x = c.getContext('2d');
  x.translate(S / 2, S * .92); x.scale(S / 2.2, -S / 2.2);
  x.beginPath();
  const lobes = 5, spread = 1.9;
  for (let i = 0; i < lobes; i++) {
    const a = -spread / 2 + spread * (i / (lobes - 1)) + Math.PI / 2;
    const len = i === 2 ? .96 : (i === 1 || i === 3 ? .82 : .60);
    const wob = .17;
    x.moveTo(0, .02);
    x.lineTo(Math.cos(a - wob) * len * .55, Math.sin(a - wob) * len * .55);
    x.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    x.lineTo(Math.cos(a + wob) * len * .55, Math.sin(a + wob) * len * .55);
    x.closePath();
  }
  x.fillStyle = '#fff'; x.fill();
  x.lineWidth = .05; x.strokeStyle = '#fff'; x.stroke();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-out';
  const rnd = mulberry32(3);
  for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(rnd() * S, rnd() * S, rnd() * 3, 0, TAU); x.fill(); }
  return c;
}

/* one gulmohar petal: a narrow claw opening into a broad, crinkled spoon.
   White, so the material's colour decides how red the tree is. */
function texPetal() {
  const S = 128, c = cvs(S, S), x = c.getContext('2d');
  x.translate(S / 2, S * .96); x.scale(S / 2.3, -S / 2.3);
  x.beginPath();
  x.moveTo(-.05, 0);
  x.bezierCurveTo(-.10, .35, -.78, .55, -.70, 1.12);
  x.bezierCurveTo(-.62, 1.62, -.25, 1.90, 0, 1.86);
  x.bezierCurveTo(.25, 1.90, .62, 1.62, .70, 1.12);
  x.bezierCurveTo(.78, .55, .10, .35, .05, 0);
  x.closePath();
  x.fillStyle = '#fff'; x.fill();
  x.setTransform(1, 0, 0, 1, 0, 0);
  /* the crinkle at the rim, and the fine veins */
  x.globalCompositeOperation = 'destination-out';
  const rnd = mulberry32(5);
  for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(S * (.2 + rnd() * .6), S * (.04 + rnd() * .1), 2 + rnd() * 3, 0, TAU); x.fill(); }
  x.globalCompositeOperation = 'source-atop';
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(S / 2, S * .92); x.quadraticCurveTo(S / 2 + i * 6, S * .5, S / 2 + i * 13, S * .14); x.stroke(); }
  return c;
}

/* the night sky itself: black at altitude, going to the fog colour at the
   horizon so the backdrop and the depth cue meet without a seam */
function texSky() {
  const W = 512, H = 512, c = cvs(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgb(6,10,15)');    g.addColorStop(.34, 'rgb(13,22,31)');
  g.addColorStop(.66, 'rgb(17,26,34)'); g.addColorStop(.88, 'rgb(24,35,42)');
  g.addColorStop(1, 'rgb(14,22,28)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  /* cloud, and a low warm bloom off the valley behind the ridge */
  x.globalAlpha = .34; x.globalCompositeOperation = 'overlay';
  x.drawImage(fbmCanvas(W, H, 313, 5, 3, .9), 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  const wg = x.createRadialGradient(W * .68, H * .95, 4, W * .68, H * .95, W * .44);
  wg.addColorStop(0, 'rgba(150,66,26,.30)'); wg.addColorStop(.5, 'rgba(96,44,22,.12)');
  wg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = wg; x.fillRect(0, 0, W, H);
  /* a scatter of stars, faint enough to survive the bloom */
  const rnd = mulberry32(881);
  for (let i = 0; i < 420; i++) {
    const sx = rnd() * W, sy = rnd() * H * .78, r = .5 + rnd() * rnd() * 1.7;
    x.fillStyle = 'rgba(214,232,240,' + (.12 + rnd() * .42) * (1 - sy / H) + ')';
    x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
  }
  return c;
}

/* the wooded ridge the valley closes with — black, ragged, mostly fog */
function texRidge() {
  const W = 2048, H = 512, c = cvs(W, H), x = c.getContext('2d');
  const n = noise2D(1207), rnd = mulberry32(1207);
  x.beginPath(); x.moveTo(0, H);
  for (let i = 0; i <= W; i += 4) {
    const t = i / W;
    const ridge = .46 + .30 * (fbm(n, t * 2.4, .5, 4, 2.1, .55) * .5 + .5)
                      + .16 * (fbm(n, t * 7.5, 3.1, 3, 2.2, .5) * .5 + .5);
    x.lineTo(i, H - ridge * H * .84);
  }
  x.lineTo(W, H); x.closePath();
  x.fillStyle = '#050809'; x.fill();
  /* conifer spikes along the crest so the silhouette reads as forest */
  x.fillStyle = '#050809';
  for (let i = 0; i < 460; i++) {
    const px = rnd() * W, t = px / W;
    const ridge = .46 + .30 * (fbm(n, t * 2.4, .5, 4, 2.1, .55) * .5 + .5)
                      + .16 * (fbm(n, t * 7.5, 3.1, 3, 2.2, .5) * .5 + .5);
    const by = H - ridge * H * .84, hh = 8 + rnd() * 30, ww = 3 + rnd() * 6;
    x.beginPath(); x.moveTo(px, by - hh); x.lineTo(px + ww, by + 4); x.lineTo(px - ww, by + 4);
    x.closePath(); x.fill();
  }
  return c;
}

/* glazed roof tile — half-round caps running down the slope, weathered */
function texRoof() {
  const W = 512, H = 512, c = cvs(W, H), x = c.getContext('2d');
  const h = cvs(W, H), hx = h.getContext('2d');
  x.fillStyle = '#151c20'; x.fillRect(0, 0, W, H);
  hx.fillStyle = '#606060'; hx.fillRect(0, 0, W, H);
  const ribs = 14, s = W / ribs;
  for (let i = 0; i < ribs; i++) {
    const g = x.createLinearGradient(i * s, 0, (i + 1) * s, 0);
    g.addColorStop(0, 'rgba(0,0,0,.62)');  g.addColorStop(.30, 'rgba(148,178,192,.13)');
    g.addColorStop(.66, 'rgba(84,110,124,.05)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
    x.fillStyle = g; x.fillRect(i * s, 0, s, H);
    x.fillStyle = 'rgba(0,0,0,.50)'; x.fillRect(i * s - 3, 0, 6, H);
    x.fillStyle = 'rgba(168,196,208,.09)'; x.fillRect(i * s - 1.2, 0, 1.6, H);
    /* the half-round cap itself, as height: the valley between two tiles is
       the only reason a tiled roof reads as tiled at this distance */
    const hg = hx.createLinearGradient(i * s, 0, (i + 1) * s, 0);
    hg.addColorStop(0, '#2c2c2c'); hg.addColorStop(.5, '#eaeaea'); hg.addColorStop(1, '#2c2c2c');
    hx.fillStyle = hg; hx.fillRect(i * s, 0, s, H);
  }
  /* the courses running down the slope — each tile overlaps the one below */
  const rnd = mulberry32(211);
  for (let y = 0; y < H; y += H / 9) {
    x.fillStyle = 'rgba(0,0,0,.34)'; x.fillRect(0, y, W, 3.5);
    hx.fillStyle = 'rgba(0,0,0,.55)'; hx.fillRect(0, y, W, 3.5);
    hx.fillStyle = 'rgba(255,255,255,.28)'; hx.fillRect(0, y + 3.5, W, 2);
    for (let i = 0; i < 26; i++) {                     /* chipped, mossed edges */
      x.fillStyle = rnd() > .5 ? 'rgba(0,0,0,.30)' : 'rgba(96,116,92,.10)';
      x.fillRect(rnd() * W, y + 1, 2 + rnd() * 9, 2 + rnd() * 3);
    }
  }
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .46;
  x.drawImage(fbmCanvas(256, 256, 211, 5, 3, 1), 0, 0, W, H);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  hx.globalAlpha = .3; hx.drawImage(fbmCanvas(256, 256, 213, 4, 16, 1.2), 0, 0, W, H);
  hx.globalAlpha = 1;
  return { map: c, normal: normalFromHeight(h, 2.2) };
}

/* -------------------------------------------------------- the blood moon
   A real lunar disc, not a glow sprite and not a noise field. Three things do
   the work, in this order of importance:

     1 · the maria. The dark seas are the Moon's signature and they are not
         fbm — they are a handful of large, lobed, soft-edged basins in a
         layout everyone has known since childhood. Drawn at their real
         near-side positions and blurred, they are what makes the disc read as
         the Moon at a glance instead of as a planet.
     2 · the ray systems. Fine bright streaks thrown out of Tycho and
         Copernicus, straight across the maria. Nothing else on the surface
         looks like this, so nothing else identifies it as fast.
     3 · the craters, thickest in the bright highlands, each with a rim lit
         from the same side as the rest of the frame.

   The tint is measured off the reference plate, not invented: a blood moon
   sits at G/R ≈ B/R ≈ .48 — a rose red with green and blue level. Grading it
   as an orange (blue well under green) is what makes a CG moon read as a
   fireball, and that is what this was doing. The disc is authored here in
   near-neutral albedo and the colour is applied once, on the material. */
function texMoon() {
  const S = 512, c = cvs(S, S), x = c.getContext('2d');
  const R = S / 2 - 1, rnd = mulberry32(91);
  const px = (u, v) => [S / 2 + u * R, S / 2 + v * R];        /* disc coords */

  x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.closePath();
  x.save(); x.clip();

  /* highland base. The reference disc is very slightly brighter at the limb,
     not darker — during totality the rim keeps its forward scatter — so this
     ramp opens outward instead of falling off. */
  const g = x.createRadialGradient(S * .46, S * .44, S * .05, S / 2, S / 2, R);
  g.addColorStop(0, 'rgb(150,150,150)'); g.addColorStop(.55, 'rgb(158,158,158)');
  g.addColorStop(.86, 'rgb(178,178,178)'); g.addColorStop(1, 'rgb(196,196,196)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);

  /* fine highland mottle */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .5;
  x.drawImage(fbmCanvas(256, 256, 517, 6, 4, 1.1), 0, 0, S, S);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* --- 1 · the maria, at their near-side places (u right, v down) --------- */
  const seas = [
    [-.52, -.06, .46, .80],   /* Oceanus Procellarum */
    [-.26, -.38, .31, .92],   /* Imbrium             */
    [ .13, -.31, .20, .88],   /* Serenitatis         */
    [ .30, -.08, .23, .84],   /* Tranquillitatis     */
    [ .45,  .12, .15, .78],   /* Fecunditatis        */
    [ .27,  .27, .12, .74],   /* Nectaris            */
    [ .57, -.30, .12, .95],   /* Crisium, the one that stands on its own */
    [-.27,  .30, .19, .70],   /* Nubium              */
    [-.47,  .25, .13, .72],   /* Humorum             */
  ];
  const sea = cvs(S, S), sx = sea.getContext('2d');
  seas.forEach(([u, v, rad, dk]) => {
    /* a basin is a cluster of lobes, never a circle */
    for (let i = 0; i < 22; i++) {
      const a = rnd() * TAU, off = rnd() * rad * .66;
      const [bx, by] = px(u + Math.cos(a) * off, v + Math.sin(a) * off * .8);
      const rr = rad * R * (.30 + rnd() * .46);
      const bg = sx.createRadialGradient(bx, by, rr * .2, bx, by, rr);
      bg.addColorStop(0, 'rgba(0,0,0,' + (dk * .14).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      sx.fillStyle = bg; sx.beginPath(); sx.arc(bx, by, rr, 0, TAU); sx.fill();
    }
  });
  /* a sea is dark, not black: the real mare/highland contrast is about 4:3,
     and anything heavier turns the disc into a skull */
  x.save(); x.filter = 'blur(9px)'; x.globalAlpha = .90;
  x.drawImage(sea, 0, 0); x.restore();
  /* mottle riding on top of the basins so their floors are not flat washes */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .18;
  x.drawImage(fbmCanvas(256, 256, 811, 4, 11, 1.2), 0, 0, S, S);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* --- 2 · ray systems, thrown clear across the disc ---------------------- */
  const ray = cvs(S, S), rx2 = ray.getContext('2d');
  [[-.10, .54, 150, 1], [-.28, -.07, 80, .6], [-.46, -.04, 60, .45]].forEach(([u, v, n, str]) => {
    const [ox, oy] = px(u, v);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, len = R * (.30 + rnd() * rnd() * 1.3);
      /* start clear of the crater — rays converging on a point read as a
         lens flare, and the real ones begin outside the ejecta blanket */
      const t0 = R * (.08 + rnd() * .06);
      const p0 = [ox + Math.cos(a) * t0, oy + Math.sin(a) * t0];
      const p1 = [ox + Math.cos(a) * len, oy + Math.sin(a) * len];
      const rg = rx2.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      rg.addColorStop(0, 'rgba(255,255,255,' + (.085 * str).toFixed(3) + ')');
      rg.addColorStop(.4, 'rgba(255,255,255,' + (.055 * str).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      rx2.strokeStyle = rg; rx2.lineWidth = .8 + rnd() * 2.4; rx2.lineCap = 'round';
      rx2.beginPath(); rx2.moveTo(p0[0], p0[1]);
      rx2.quadraticCurveTo(ox + Math.cos(a + .06) * len * .55, oy + Math.sin(a + .06) * len * .55,
                           p1[0], p1[1]);
      rx2.stroke();
    }
  });
  x.save(); x.filter = 'blur(2.4px)'; x.globalCompositeOperation = 'lighter';
  x.globalAlpha = .62; x.drawImage(ray, 0, 0); x.restore();

  /* --- 3 · the crater field ----------------------------------------------
     A crater is not a ring. Stroked with a gradient running across it, the
     same circle gives a rim lit on the sun side and thrown into shadow on the
     other — which is the read — where a radial ring gives a bubble. */
  const inSea = (u, v) => seas.some(([su, sv, rad]) =>
    Math.hypot(u - su, (v - sv) * 1.15) < rad * .82);
  for (let i = 0; i < 620; i++) {
    const a = rnd() * TAU, rr = Math.sqrt(rnd()) * .97;
    const u = Math.cos(a) * rr, v = Math.sin(a) * rr;
    /* the seas are young and nearly unmarked — that contrast is the point */
    if (inSea(u, v) && rnd() > .12) continue;
    const [cx2, cy] = px(u, v);
    const big = rnd() > .975;
    const r = (1 + rnd() * rnd() * rnd() * (big ? 34 : 11)) * (S / 512);
    const fade = .55 + .45 * Math.sqrt(Math.max(0, 1 - rr * rr));   /* limb falloff */
    /* foreshortened toward the limb, like anything on a sphere */
    const sq = Math.sqrt(Math.max(0, 1 - rr * rr)) * .72 + .28;
    x.save(); x.translate(cx2, cy); x.rotate(Math.atan2(v, u)); x.scale(sq, 1);
    x.rotate(-Math.atan2(v, u));                       /* keep the sun direction */
    const rimW = Math.max(.8, r * .26);
    const lg = x.createLinearGradient(-r, -r, r, r);   /* sun sits up-left */
    lg.addColorStop(0, 'rgba(255,255,255,' + (.34 * fade).toFixed(3) + ')');
    lg.addColorStop(.5, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,' + (.38 * fade).toFixed(3) + ')');
    x.strokeStyle = lg; x.lineWidth = rimW;
    x.beginPath(); x.arc(0, 0, Math.max(.6, r - rimW * .5), 0, TAU); x.stroke();
    if (r > 3) {                                        /* the floor it encloses */
      const fg = x.createLinearGradient(-r, -r, r, r);
      fg.addColorStop(0, 'rgba(0,0,0,' + (.21 * fade).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,' + (.07 * fade).toFixed(3) + ')');
      x.fillStyle = fg; x.beginPath(); x.arc(0, 0, r - rimW, 0, TAU); x.fill();
    }
    if (r > 13) {                                       /* central peak */
      x.fillStyle = 'rgba(255,255,255,' + (.14 * fade).toFixed(3) + ')';
      x.beginPath(); x.arc(-r * .04, -r * .04, r * .11, 0, TAU); x.fill();
    }
    x.restore();
  }

  /* surface tooth: genuinely fine, or it just adds another layer of cloud
     and the basins disappear under it */
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .13;
  x.drawImage(fbmCanvas(S, S, 977, 2, 210, 1.3), 0, 0, S, S);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* the terminator side: the disc is not lit dead-on */
  const sh = x.createRadialGradient(S * .40, S * .38, S * .18, S * .52, S * .56, S * .72);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.30)');
  x.fillStyle = sh; x.fillRect(0, 0, S, S);
  x.restore();

  /* a one-pixel feather on the limb so it is a moon in air, not a cut disc */
  const fe = x.createRadialGradient(S / 2, S / 2, R - 2.5, S / 2, S / 2, R);
  fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = fe; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/* soft round falloff — haze, embers, glows */
function texGlow(inner, mid) {
  const S = 256, c = cvs(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner || 'rgba(255,255,255,1)');
  g.addColorStop(.28, mid || 'rgba(255,255,255,.36)');
  g.addColorStop(.62, 'rgba(255,255,255,.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}

/* one wisp — a round mote, not a streak. The whole read is a hard bright
   point sitting in a soft halo, so the falloff is deliberately uneven: almost
   all of the light is spent inside the first eighth of the radius and the rest
   is a wide, very faint bloom. A smooth gradient across the full radius gives
   an evenly lit blob with no centre to it. */
function texWisp() {
  const S = 128, c = cvs(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0,   'rgba(255,255,255,1)');      /* the point itself */
  g.addColorStop(.07, 'rgba(236,250,250,.92)');
  g.addColorStop(.16, 'rgba(190,230,238,.40)');
  g.addColorStop(.34, 'rgba(132,192,212,.13)');
  g.addColorStop(.62, 'rgba(88,146,172,.035)');
  g.addColorStop(1,   'rgba(70,120,142,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}

/* ---------------------------------------------- 3 · the foreground cut-outs
   These are the "transparent PNG" layers: painted at high resolution with
   a ragged alpha edge, then hung in front of the type as real geometry so
   they parallax and sway.                                                */
function texGrassCutout(seed, opt) {
  opt = opt || {};
  const W = opt.w || 2048, H = opt.h || 1024;
  const c = cvs(W, H), x = c.getContext('2d');
  const rnd = mulberry32(seed), n = noise2D(seed * 13 + 5);

  /* --- silhouette ------------------------------------------------- */
  const crest = opt.crest !== undefined ? opt.crest : .46;
  const peak  = opt.peak  !== undefined ? opt.peak  : .60;
  const wide  = opt.wide  !== undefined ? opt.wide  : .40;
  const prof = new Float32Array(W);
  for (let i = 0; i < W; i++) {
    const t = i / W;
    let m = Math.exp(-Math.pow((t - crest) / wide, 2) * 2.1);
    m += .46 * Math.exp(-Math.pow((t - crest - (opt.crest2 || .40)) / (wide * .62), 2) * 3.1);
    m += .30 * Math.exp(-Math.pow((t - crest + (opt.crest3 || .46)) / (wide * .70), 2) * 3.4);
    const g = fbm(n, t * 4.2, .5, 4, 2.05, .52) * .5 + .5;
    prof[i] = m * (.80 + .38 * g);
  }
  let pk = 0; for (let i = 0; i < W; i++) pk = Math.max(pk, prof[i]);
  for (let i = 0; i < W; i++) prof[i] *= H * peak / pk;
  const surf = i => H - prof[clamp(i | 0, 0, W - 1)];

  /* --- body ------------------------------------------------------- */
  x.beginPath(); x.moveTo(0, H);
  for (let i = 0; i < W; i += 3) x.lineTo(i, surf(i));
  x.lineTo(W, surf(W - 1)); x.lineTo(W, H); x.closePath();
  const bg = x.createLinearGradient(0, H - H * peak, 0, H);
  bg.addColorStop(0, '#1a2416'); bg.addColorStop(.38, '#0e150c'); bg.addColorStop(1, '#040604');
  x.fillStyle = bg; x.fill();
  x.save(); x.clip();
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = .5;
  x.drawImage(fbmCanvas(1024, 512, seed + 3, 5, 3, 1), 0, 0, W, H);
  x.restore();
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';

  /* --- blades ----------------------------------------------------- */
  const LIGHT = opt.light || [-.42, -.91];            /* light comes from up-left */
  const N = opt.blades || 15000;
  const blades = [];
  for (let k = 0; k < N; k++) {
    const i = (rnd() * W) | 0;
    const s = surf(i);
    /* bias the population toward the silhouette so the edge stays ragged */
    const depth = Math.pow(rnd(), 2.3);
    const by = s + depth * (H - s) + (rnd() - .5) * 6;
    if (by > H + 20) continue;
    blades.push({ i: i, by: by, depth: depth, r: rnd(), r2: rnd(), r3: rnd() });
  }
  blades.sort((a, b) => a.by - b.by);                 /* far (high) first */

  const LEN = (opt.len || 46) * (W / 2048);
  for (let k = 0; k < blades.length; k++) {
    const b = blades[k];
    const bx = b.i + (b.r - .5) * 5;
    const grow = 1 - .52 * b.depth;
    const len = LEN * (.36 + 1.05 * b.r2 * b.r2) * grow;
    let lean = (b.r3 - .5) * 1.5 + (opt.wind || .16);
    /* blades on the sunward flank lean into frame */
    const tipx = bx + lean * len * .95, tipy = b.by - len;
    const cx2 = bx + lean * len * .30, cy2 = b.by - len * .62;
    const w = (.9 + 1.9 * b.r) * grow * (W / 2048);

    /* shade: facing the key light, plus exposure to the sky at the crest */
    const dx = tipx - bx, dy = tipy - b.by, il = 1 / Math.hypot(dx, dy);
    const ndl = sat((-(dx * il) * LIGHT[0] - (dy * il) * LIGHT[1]) * .5 + .5);
    const open = Math.pow(1 - b.depth, 1.35);
    let l = .10 + .46 * open + .34 * ndl * open;
    const warm = sat(open * 1.25 - .42) * (opt.warm !== undefined ? opt.warm : 1);
    const r = (10 + 78 * l + 44 * warm) * (opt.tintR || 1);
    const g = (16 + 106 * l + 24 * warm) * (opt.tintG || 1);
    const bl = (12 + 80 * l + 16 * warm) * (opt.tintB || 1);
    x.fillStyle = hex(r, g, bl);
    x.beginPath();
    x.moveTo(bx - w, b.by);
    x.quadraticCurveTo(cx2 - w * .35, cy2, tipx, tipy);
    x.quadraticCurveTo(cx2 + w * .35, cy2, bx + w, b.by);
    x.closePath(); x.fill();
  }

  /* --- grade: red bounce from the sun, cold sky on the crest ------- */
  x.globalCompositeOperation = 'source-atop';
  const rb = x.createLinearGradient(opt.bounceFrom || W, 0, opt.bounceTo || 0, 0);
  rb.addColorStop(0, 'rgba(180,40,16,.24)'); rb.addColorStop(.55, 'rgba(140,32,14,.07)'); rb.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rb; x.fillRect(0, 0, W, H);
  const sk = x.createLinearGradient(0, H - H * peak * 1.05, 0, H);
  sk.addColorStop(0, 'rgba(146,182,180,.13)'); sk.addColorStop(.5, 'rgba(0,0,0,0)'); sk.addColorStop(1, 'rgba(0,0,0,.70)');
  x.fillStyle = sk; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/* wet foreground boulders */
function texRockCutout(seed, opt) {
  opt = opt || {};
  const W = opt.w || 1536, H = opt.h || 1024;
  const c = cvs(W, H), x = c.getContext('2d');
  const rnd = mulberry32(seed), n = noise2D(seed * 7 + 11);
  const blobs = opt.blobs || [[.30, .70, .40, .34], [.66, .82, .38, .28], [.46, .96, .52, .34]];

  blobs.forEach((b, bi) => {
    const cx2 = b[0] * W, cy = b[1] * H, rx = b[2] * W * .5, ry = b[3] * H * .8;
    x.beginPath();
    for (let a = 0; a <= 128; a++) {
      const t = a / 128 * TAU;
      const k = 1 + .17 * fbm(n, Math.cos(t) * 1.7 + bi * 9, Math.sin(t) * 1.7, 4, 2.1, .55);
      const px = cx2 + Math.cos(t) * rx * k, py = cy + Math.sin(t) * ry * k;
      a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath();
    const g = x.createLinearGradient(cx2 - rx, cy - ry, cx2 + rx * .4, cy + ry);
    const s = 1 - bi * .16;
    g.addColorStop(0, hex(30 * s, 39 * s, 40 * s));
    g.addColorStop(.42, hex(14 * s, 19 * s, 20 * s));
    g.addColorStop(1, hex(6, 9, 9));
    x.fillStyle = g; x.fill();
    x.save(); x.clip();
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = .62;
    x.drawImage(fbmCanvas(768, 512, seed + bi * 31, 6, 4, 1.1), 0, 0, W, H);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    /* facets */
    for (let f = 0; f < 26; f++) {
      x.beginPath();
      const fx = cx2 + (rnd() - .5) * rx * 2, fy = cy + (rnd() - .5) * ry * 1.6;
      x.moveTo(fx, fy);
      for (let v = 0; v < 3; v++) x.lineTo(fx + (rnd() - .5) * rx * .8, fy + (rnd() - .5) * ry * .6);
      x.closePath();
      x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.030)' : 'rgba(0,0,0,.14)';
      x.fill();
    }
    /* wet highlight along the upper rim */
    x.lineWidth = 3 + rnd() * 4; x.strokeStyle = 'rgba(178,206,206,.20)';
    x.beginPath();
    for (let a = 0; a <= 60; a++) {
      const t = Math.PI + a / 60 * Math.PI * .78;
      const k = 1 + .17 * fbm(n, Math.cos(t) * 1.7 + bi * 9, Math.sin(t) * 1.7, 4, 2.1, .55);
      const px = cx2 + Math.cos(t) * rx * k * .97, py = cy + Math.sin(t) * ry * k * .97;
      a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
    x.restore();
  });

  /* a little moss where they meet the ground */
  x.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * W, py = H - Math.pow(rnd(), 1.7) * H * .5;
    x.fillStyle = 'rgba(' + (40 + rnd() * 40 | 0) + ',' + (60 + rnd() * 46 | 0) + ',34,' + (.05 + rnd() * .22) + ')';
    x.fillRect(px, py, 1.6 + rnd() * 2.4, 3 + rnd() * 9);
  }
  const rb = x.createLinearGradient(W, 0, 0, 0);
  rb.addColorStop(0, 'rgba(190,48,22,.16)'); rb.addColorStop(.7, 'rgba(0,0,0,0)');
  x.fillStyle = rb; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/* a maple bough leaning into the top of frame */
function texBranchCutout(seed) {
  const W = 1536, H = 1024;
  const c = cvs(W, H), x = c.getContext('2d');
  const rnd = mulberry32(seed);
  const leaves = [];

  function bough(px, py, ang, len, wid, depth) {
    const steps = 7;
    let cx2 = px, cy = py, a = ang;
    x.beginPath(); x.moveTo(cx2, cy);
    for (let s = 0; s < steps; s++) {
      a += (rnd() - .5) * .30;
      cx2 += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps;
      x.lineTo(cx2, cy);
    }
    x.lineCap = 'round'; x.lineWidth = wid;
    x.strokeStyle = 'rgba(' + (26 + depth * 5 | 0) + ',' + (22 + depth * 4 | 0) + ',' + (22 + depth * 4 | 0) + ',1)';
    x.stroke();
    if (depth < 4 && len > 34) {
      const k = depth === 0 ? 3 : 2;
      for (let i = 0; i < k; i++) bough(cx2, cy, a + (rnd() - .5) * 1.25, len * (.58 + rnd() * .18), wid * .58, depth + 1);
    } else {
      for (let i = 0; i < 16; i++)
        leaves.push([cx2 + (rnd() - .5) * 84, cy + (rnd() - .5) * 84, rnd() * TAU, 6 + rnd() * 10, rnd()]);
    }
  }
  bough(W * 1.02, H * .06, Math.PI * .78, 420, 26, 0);
  bough(W * .86, -H * .02, Math.PI * .62, 330, 18, 1);

  const leafImg = texPetal();
  const tint = cvs(128, 128), tx = tint.getContext('2d');
  leaves.forEach(l => {
    tx.clearRect(0, 0, 128, 128);
    tx.drawImage(leafImg, 0, 0);
    tx.globalCompositeOperation = 'source-in';
    const v = l[4];
    tx.fillStyle = hex(150 + v * 80, 26 + v * 44, 8 + v * 14);
    tx.fillRect(0, 0, 128, 128);
    tx.globalCompositeOperation = 'source-over';
    x.save(); x.translate(l[0], l[1]); x.rotate(l[2]);
    x.globalAlpha = .78 + v * .22;
    x.drawImage(tint, -l[3], -l[3], l[3] * 2, l[3] * 2);
    x.restore();
  });
  x.globalAlpha = 1;
  return c;
}
/* ================================================================= 4 · gl */
const canvas = document.getElementById('gl');
/* The layout viewport, not the window. On mobile `innerWidth` follows the
   initial containing block, which can run wider than the visual viewport —
   measured at 437 against a 390 screen — while `clientWidth` tracks what CSS
   actually lays out against. Sizing the canvas from `innerWidth` therefore
   renders a frame wider than the phone shows and drops the right edge of the
   scene off-screen, which is how the wordmark lost its last letter. Every
   size, aspect and pointer mapping below goes through these. */
const vpW = () => document.documentElement.clientWidth  || innerWidth;
const vpH = () => document.documentElement.clientHeight || innerHeight;
let renderer, scene, camera, maxAniso = 1;
const HI = qs('q', COARSE ? 'low' : 'high');
const LOW = HI === 'low';
const WANT_POST    = qs('post', '1') !== '0';
const WANT_SHADOW  = qs('shadow', LOW ? '0' : '1') !== '0';
const DPR_CAP      = qn('dpr', LOW ? 1.4 : 1.8);
/* the renderer trades resolution for frame rate on its own — the scene is
   fill-bound (five big alpha-blended veils plus a bloom chain), so pixels
   are the only knob worth turning on unknown hardware */
const PERF = { scale: 1, acc: 0, n: 0, locked: qs('adapt', '1') === '0' };

function initGL() {
  if (qs('nogl', '0') !== '0' || !window.THREE) throw new Error('webgl disabled');
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !WANT_POST, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
  /* updateStyle stays on: the stylesheet sizes the canvas at 100% of the
     initial containing block, which is the very box that runs wide on a
     phone. Writing the CSS size in pixels pins the element to the layout
     viewport the buffer was built for. */
  renderer.setSize(vpW(), vpH(), true);
  renderer.outputEncoding = WANT_POST ? THREE.LinearEncoding : THREE.sRGBEncoding;
  renderer.toneMapping = WANT_POST ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x05070a, 1);
  if (WANT_SHADOW) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  scene = new THREE.Scene();
    /* Density puts the hall back in the air; the colour is what decides how
     dark it is back there. At this depth most of the building's pixel is
     fog rather than its own material — darkening the timber and the tiles
     moved the hall by 0.18 of a luminance unit, the fog colour moves it
     properly. And it reaches by distance, so the foreground does not
     follow it down. */
  scene.fog = new THREE.FogExp2(0x070a0f, 0.0125);
  scene.background = new THREE.Color(0x060a0d);
  camera = new THREE.PerspectiveCamera(36, vpW() / vpH(), .35, 220);
  scene.add(camera);
}

function tx(canvasEl, o) {
  o = o || {};
  const t = new THREE.CanvasTexture(canvasEl);
  t.wrapS = t.wrapT = o.wrap || THREE.ClampToEdgeWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.anisotropy = Math.min(o.aniso || 8, maxAniso);
  if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
}
/* HDR-bright emitters: values above 1 survive because the scene is rendered
   into a half-float buffer, and they are what the bloom feeds on */
const hdr = (r, g, b) => new THREE.Color().setRGB(r, g, b);

/* A {map, normal, rough} set hung on a standard material at one tiling. The
   colour is a multiplier on an already-dark albedo, so it is how a shared
   board or block library is re-tinted per use rather than regenerated.
   roughness stays at 1: the map carries the variation, and anything less
   scales the whole surface toward a polish it should not have. */
function surface(t, rep, o) {
  o = o || {};
  const wrap = THREE.RepeatWrapping, aniso = o.aniso || 8;
  const m = new THREE.MeshStandardMaterial({
    map: tx(t.map, { wrap: wrap, repeat: rep, aniso: aniso }),
    normalMap: tx(t.normal, { wrap: wrap, repeat: rep, srgb: false, aniso: aniso }),
    normalScale: new THREE.Vector2(o.normal === undefined ? .8 : o.normal,
                                   o.normal === undefined ? .8 : o.normal),
    color: o.color === undefined ? 0xffffff : o.color,
    roughness: o.roughness === undefined ? 1 : o.roughness,
    metalness: o.metalness === undefined ? .02 : o.metalness
  });
  if (t.rough) m.roughnessMap = tx(t.rough, { wrap: wrap, repeat: rep, srgb: false });
  return m;
}
/* The board and block libraries are generated once and shared. buildLantern
   alone is called six times, and a granite per lantern is six pointless
   canvases and six normal-map passes at load. */
const LIB = {};
const lib = (k, f) => (LIB[k] || (LIB[k] = f()));
/* the walls are boarded; a column, a sill and a rail are each one stick of
   wood and must not carry a joint down the middle of them */
const wallWood = () => lib('wallWood', () => texWood(3, { boards: 7 }));
const postWood = () => lib('postWood', () => texWood(29, { boards: 0 }));

/* sweep a polygonal cross-section along a path — kasagi, shimaki, beams */
function sweepPoly(points, profile) {
  const segs = points.length, np = profile.length;
  const pos = [], nor = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(segs - 1, i + 1)];
    T.subVectors(b, a).normalize();
    B.crossVectors(T, up).normalize();
    N.crossVectors(B, T).normalize();
    for (let j = 0; j < np; j++) {
      const u = profile[j][0], v = profile[j][1], l = Math.hypot(u, v) || 1;
      pos.push(p.x + B.x * u + N.x * v, p.y + B.y * u + N.y * v, p.z + B.z * u + N.z * v);
      nor.push(B.x * u / l + N.x * v / l, B.y * u / l + N.y * v / l, B.z * u / l + N.z * v / l);
      uv.push(j / np, i / (segs - 1));
    }
  }
  for (let i = 0; i < segs - 1; i++) for (let j = 0; j < np; j++) {
    const j2 = (j + 1) % np, a = i * np + j, b = i * np + j2, c = (i + 1) * np + j2, d = (i + 1) * np + j;
    idx.push(a, b, c, a, c, d);
  }
  /* caps */
  [0, segs - 1].forEach((ring, k) => {
    const base = pos.length / 3, p = points[ring];
    pos.push(p.x, p.y, p.z); nor.push(0, 0, k ? 1 : -1); uv.push(.5, .5);
    for (let j = 0; j < np; j++) {
      const a = ring * np + j, b = ring * np + (j + 1) % np;
      k ? idx.push(base, a, b) : idx.push(base, b, a);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/* A temple roof. The height is a concave function of the Chebyshev distance
   from the ridge out to the eave, and the last fifth of that run flares back
   upward — that lift at the corners is the whole silhouette. Emitted solid:
   a top shell, an underside shell, and a fascia stitching the two rims. */
function roofGeo(A, B, R, Hr, thick, flare) {
  const NX = 52, NZ = 34, FL = flare === undefined ? .30 : flare, e = 1e-3;
  /* The lift has to be weighted toward the corners. Applied evenly along the
     eave it produces a raised rim the whole way round and the roof reads as a
     saucer; concentrated where the two runs meet, it reads as a temple. */
  const hAt = (x, z) => {
    const cx = Math.min(1, Math.abs(x) / A), cz = Math.min(1, Math.abs(z) / B);
    const tx = Math.max(0, (Math.abs(x) - R) / Math.max(A - R, 1e-4));
    const t = Math.min(1, Math.max(tx, cz));
    return Hr * Math.pow(1 - t, 1.45)
         + FL * Hr * smooth(.72, 1, t) * (.52 + .68 * Math.min(cx, cz));
  };
  const pos = [], nor = [], uv = [], idx = [];
  const N = new THREE.Vector3();
  const VPS = (NX + 1) * (NZ + 1);
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = -A + 2 * A * i / NX, z = -B + 2 * B * j / NZ;
      N.set(-(hAt(x + e, z) - hAt(x - e, z)) / (2 * e), 1,
            -(hAt(x, z + e) - hAt(x, z - e)) / (2 * e)).normalize();
      if (k) N.negate();
      pos.push(x, hAt(x, z) - (k ? thick : 0), z);
      nor.push(N.x, N.y, N.z);
      /* one tile every seven metres: at half a metre the ribs land inside a
         pixel at this range and the mip chain averages them to flat grey */
      uv.push(x * .14, z * .14);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = k * VPS + j * (NX + 1) + i, b = a + 1, c = a + NX + 2, d = a + NX + 1;
      k ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d);
    }
  }
  /* fascia: its own ring of vertices so the eave edge keeps a sideways normal */
  const per = [];
  for (let i = 0; i <= NX; i++) per.push([i, 0]);
  for (let j = 1; j <= NZ; j++) per.push([NX, j]);
  for (let i = NX - 1; i >= 0; i--) per.push([i, NZ]);
  for (let j = NZ - 1; j >= 1; j--) per.push([0, j]);
  const base = pos.length / 3;
  per.forEach(p => {
    const x = -A + 2 * A * p[0] / NX, z = -B + 2 * B * p[1] / NZ;
    const nx = p[0] === 0 ? -1 : (p[0] === NX ? 1 : 0);
    const nz = p[1] === 0 ? -1 : (p[1] === NZ ? 1 : 0);
    const l = Math.hypot(nx, nz) || 1;
    const y = hAt(x, z);
    pos.push(x, y, z, x, y - thick, z);
    nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
    uv.push(0, 0, 0, 1);
  });
  for (let i = 0; i < per.length; i++) {
    const a = base + i * 2, b = a + 1;
    const c = base + ((i + 1) % per.length) * 2, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function mergeGeos(list) {
  let vN = 0, iN = 0;
  list.forEach(g => { vN += g.attributes.position.count; iN += g.index.count; });
  const pos = new Float32Array(vN * 3), nor = new Float32Array(vN * 3), uv = new Float32Array(vN * 2);
  const idx = vN > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
  let vo = 0, io = 0;
  list.forEach(g => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    io += gi.length; vo += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ========================================================== 5 · the world */
const WORLD = {};                 /* named handles the page can animate */
const swayers = [];               /* things the wind touches */

/* ---- the street plan, in metres ---------------------------------------
   The road runs away from the camera down −z. Shops line both kerbs and a
   wider building closes the far end, so every waypoint, lamp and arch is
   pinned to these and the street can be re-proportioned in one place.   */
const ROAD_W   = 10.0;            /* kerb to kerb                              */
const WALK_W   = 2.4;             /* the footpath in front of each shop row    */
const ROW_X    = ROAD_W / 2 + WALK_W;   /* the shopfront line, ±7.4           */
const PITCH    = 6.0;             /* one shop's frontage, centre to centre     */
const FIRST_Z  = -3.0;            /* the first shop on each side               */
const END_Z    = -44.0;           /* the building that closes the street       */
const ARCH_Z   = -9.0;            /* the festival arch over the road           */
const KERB_H   = .18;

/* The shops. Each board carries its Kannada name over its English one, the
   way the street really signs itself. The first three are the demo shops the
   phone on the page runs; the rest are the neighbours. */
const SHOPS = [
  /* side, kn, en, board, ink, floors, open */
  [-1, 'ಮಲ್ಲೇಶ್ವರಂ ಅಯ್ಯಂಗಾರ್ ಬೇಕರಿ', 'MALLESWARAM IYENGAR BAKERY', '#b3161b', '#ffe9a8', 2, 1],
  [-1, 'ಗ್ಲೋ ಸಲೂನ್', 'GLOW SALON', '#1d1d24', '#f6b6d0', 1, 1],
  [-1, 'ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕ್ಲಿನಿಕ್', 'SUNRISE DENTAL CLINIC', '#f4f1e6', '#0d5b8c', 2, 1],
  [-1, 'ಶ್ರೀ ಗಣೇಶ ಸ್ಟೋರ್ಸ್', 'SRI GANESH STORES', '#f2c230', '#9b1111', 1, 1],
  [-1, 'ಉಪಹಾರ ದರ್ಶಿನಿ', 'UPAHARA DARSHINI', '#0f6b3a', '#fff3c4', 2, 1],
  [-1, 'ಸಾಯಿ ಮೆಡಿಕಲ್ಸ್', 'SAI MEDICALS', '#0a7a52', '#ffffff', 1, 0],
  [ 1, 'ಮೊಬೈಲ್ ರಿಪೇರಿ', 'MOBILE REPAIRS', '#0b3f8f', '#ffe14d', 1, 1],
  [ 1, 'ಶ್ರೀ ಲಕ್ಷ್ಮಿ ಸಿಲ್ಕ್ಸ್', 'SRI LAKSHMI SILKS', '#6d0f3a', '#f3cf72', 2, 1],
  [ 1, 'ನ್ಯೂ ಸ್ಟೈಲ್ ಟೈಲರ್ಸ್', 'NEW STYLE TAILORS', '#f4f1e6', '#b3161b', 1, 0],
  [ 1, 'ಹೂವಿನ ಅಂಗಡಿ', 'FLOWERS AND GARLANDS', '#e8761c', '#fffbe8', 1, 1],
  [ 1, 'ಕಾಫಿ ಕಾರ್ನರ್', 'COFFEE CORNER', '#3a1d10', '#ffd08a', 2, 1],
  [ 1, 'ಸ್ಟೇಷನರಿ ಮತ್ತು ಜೆರಾಕ್ಸ್', 'STATIONERY AND XEROX', '#ffffff', '#1846a3', 1, 1]
];
const KN = "'Kannada','Noto Sans Kannada',sans-serif";

/* where shop i stands, and the point on its board a camera can aim at */
function shopSpot(i) {
  const side = SHOPS[i][0], k = SHOPS.slice(0, i).filter(s => s[0] === side).length;
  return { side: side, x: side * ROW_X, z: FIRST_Z - k * PITCH };
}

/* ---------------------------------------------------------- the boards
   A lit flex board: a flat field of colour, the Kannada name set large, the
   English underneath, and the hot spots of the tube lights behind the flex
   showing through as a brighter band. Drawn once per shop.               */
function texBoard(kn, en, bg, ink, W, H) {
  W = W || 1024; H = H || 256;
  const c = cvs(W, H), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  /* the tubes behind the flex */
  const lit = x.createLinearGradient(0, 0, 0, H);
  lit.addColorStop(0, 'rgba(255,255,255,.10)'); lit.addColorStop(.45, 'rgba(255,255,255,.22)');
  lit.addColorStop(1, 'rgba(0,0,0,.18)');
  x.fillStyle = lit; x.fillRect(0, 0, W, H);
  /* a thin inner border, as every printed board has */
  x.strokeStyle = ink; x.globalAlpha = .55; x.lineWidth = H * .025;
  x.strokeRect(H * .05, H * .05, W - H * .1, H - H * .1); x.globalAlpha = 1;
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fit = (txt, font, size, max) => {
    let s = size; x.font = font.replace('$', s);
    while (x.measureText(txt).width > max && s > 10) { s -= 2; x.font = font.replace('$', s); }
  };
  fit(kn, '600 $px ' + KN, H * .40, W * .88);
  x.fillText(kn, W / 2, H * .40);
  fit(en, '700 $px Onest, sans-serif', H * .17, W * .80);
  if (x.letterSpacing !== undefined) x.letterSpacing = (H * .012) + 'px';
  x.fillText(en, W / 2, H * .78);
  if (x.letterSpacing !== undefined) x.letterSpacing = '0px';
  /* dust and weather */
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = .22;
  x.drawImage(fbmCanvas(256, 64, kn.length * 31 + 7, 4, 3, 1.2), 0, 0, W, H);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return c;
}

/* a rolling shutter: horizontal ribs in galvanised grey, half rust */
function texShutter() {
  const W = 256, H = 256, c = cvs(W, H), x = c.getContext('2d');
  x.fillStyle = '#4a4f52'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 8) {
    x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(0, y, W, 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, y + 6, W, 2);
  }
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = .5;
  x.drawImage(fbmCanvas(W, H, 515, 5, 4, 1.3), 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return c;
}

/* inside an open shop: shelves and stock as soft bars of colour under a tube */
function texInterior(seed, warm) {
  const W = 512, H = 256, c = cvs(W, H), x = c.getContext('2d'), rnd = mulberry32(seed);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, warm ? '#fff1d0' : '#eef6ff'); g.addColorStop(1, warm ? '#c98d4a' : '#9fb6c8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let r = 0; r < 4; r++) {
    const y = 30 + r * 52;
    x.fillStyle = 'rgba(60,40,24,.55)'; x.fillRect(0, y + 38, W, 6);
    for (let px = 6; px < W - 10;) {
      const w = 8 + rnd() * 30, h = 14 + rnd() * 24;
      x.fillStyle = 'hsla(' + Math.floor(rnd() * 360) + ',' + (40 + rnd() * 40) + '%,' + (38 + rnd() * 30) + '%,.85)';
      x.fillRect(px, y + 38 - h, w, h);
      px += w + 2 + rnd() * 6;
    }
  }
  /* the counter, and a figure behind it */
  x.fillStyle = 'rgba(40,28,20,.9)'; x.fillRect(0, H - 54, W, 54);
  x.fillStyle = 'rgba(30,22,18,.85)';
  const fx = 120 + rnd() * 260;
  x.beginPath(); x.arc(fx, H - 112, 15, 0, TAU); x.fill();
  x.fillRect(fx - 22, H - 96, 44, 44);
  return c;
}

/* upper-floor window: a lit or dark pane behind a painted grille */
function texWindow(lit, seed) {
  const W = 128, H = 128, c = cvs(W, H), x = c.getContext('2d'), rnd = mulberry32(seed);
  if (lit) {
    const g = x.createRadialGradient(W * .5, H * .4, 4, W * .5, H * .5, W * .7);
    g.addColorStop(0, rnd() > .5 ? '#ffe6b0' : '#dff0ff'); g.addColorStop(1, '#6d4a26');
    x.fillStyle = g;
  } else x.fillStyle = '#0b0f12';
  x.fillRect(0, 0, W, H);
  if (lit && rnd() > .4) { x.fillStyle = 'rgba(40,20,10,.55)'; x.fillRect(W * .12, 0, W * .3, H); }  /* a curtain */
  x.strokeStyle = '#1b2226'; x.lineWidth = 5;
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * W / 4, 0); x.lineTo(i * W / 4, H); x.stroke(); }
  x.lineWidth = 3; x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
  x.lineWidth = 8; x.strokeRect(0, 0, W, H);
  return c;
}

/* the city past the end of the street: apartment blocks, mostly dark */
function texSkyline() {
  const W = 2048, H = 512, c = cvs(W, H), x = c.getContext('2d'), rnd = mulberry32(2041);
  for (let px = 0; px < W;) {
    const w = 40 + rnd() * 120, h = 90 + rnd() * 300;
    x.fillStyle = '#06090c'; x.fillRect(px, H - h, w, h);
    for (let wy = H - h + 12; wy < H - 10; wy += 14)
      for (let wx = px + 6; wx < px + w - 8; wx += 12)
        if (rnd() < .07) { x.fillStyle = rnd() > .3 ? 'rgba(255,196,120,.75)' : 'rgba(200,226,255,.6)'; x.fillRect(wx, wy, 5, 6); }
    if (rnd() < .18) { x.fillStyle = '#06090c'; x.fillRect(px + w * .4, H - h - 30, 3, 30);
      x.fillStyle = 'rgba(255,60,40,.9)'; x.fillRect(px + w * .4 - 2, H - h - 34, 7, 5); }   /* aviation light */
    px += w + rnd() * 10;
  }
  return c;
}

function buildShell() {
  /* the sky, hung far enough back that the whole frustum sits inside it */
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(360, 190),
    new THREE.MeshBasicMaterial({ color: hdr(.60, .66, .78), map: tx(texSky()),
      depthWrite: false, fog: false, toneMapped: false }));
  sky.position.set(0, 62, -108); sky.renderOrder = 0; scene.add(sky);
  WORLD.sky = sky;

  /* the city beyond: two rows of blocks, the nearer one darker */
  [[-96, 14, 320, 34, 0, .9], [-74, 10, 230, 24, 22, .7]].forEach((r, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r[2], r[3]),
      new THREE.MeshBasicMaterial({ map: tx(texSkyline()), transparent: true,
        color: hdr(r[5], r[5], r[5]), depthWrite: false, fog: false }));
    m.position.set(r[4], r[1], r[0]); m.renderOrder = 1; scene.add(m);
  });

  /* the road: wet asphalt, dark and barely metallic, lit rather than mirrored */
  const fT = texFloor();
  const roadMat = new THREE.MeshStandardMaterial({
    map: tx(fT.map, { wrap: THREE.RepeatWrapping, repeat: [9, 9], aniso: 16 }),
    normalMap: tx(fT.normal, { wrap: THREE.RepeatWrapping, repeat: [9, 9], srgb: false, aniso: 16 }),
    roughnessMap: tx(fT.rough, { wrap: THREE.RepeatWrapping, repeat: [4, 4], srgb: false }),
    normalScale: new THREE.Vector2(.22, .22), roughness: .58, metalness: .10, color: 0x4a5257
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -18); road.receiveShadow = true;
  scene.add(road);
  WORLD.floor = road; WORLD.floorMat = roadMat;

  /* the dashed centre line, worn */
  const dash = new THREE.MeshStandardMaterial({ color: 0xb9b49a, roughness: .7, metalness: 0 });
  const dashes = [];
  for (let z = 12; z > END_Z + 2; z -= 4.2) dashes.push(new THREE.BoxGeometry(.16, .01, 2.0).translate(0, .006, z));
  scene.add(new THREE.Mesh(mergeGeos(dashes), dash));

  /* footpaths, and the black-and-yellow kerb every Bengaluru road wears */
  const walkMat = surface(texWall(), [6, 1], { color: 0x6c6a64, roughness: .9, normal: .5 });
  const kerbDark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .8 });
  const kerbYellow = new THREE.MeshStandardMaterial({ color: 0xb8952a, roughness: .7 });
  const dark = [], yellow = [];
  [-1, 1].forEach(s => {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(WALK_W, KERB_H, 70), walkMat);
    walk.position.set(s * (ROAD_W / 2 + WALK_W / 2), KERB_H / 2, -16); walk.receiveShadow = true;
    scene.add(walk);
    let k = 0;
    for (let z = 18; z > END_Z + 3; z -= .9, k++)
      (k % 2 ? dark : yellow).push(new THREE.BoxGeometry(.2, KERB_H + .04, .88).translate(s * ROAD_W / 2, (KERB_H + .04) / 2, z));
  });
  scene.add(new THREE.Mesh(mergeGeos(dark), kerbDark));
  scene.add(new THREE.Mesh(mergeGeos(yellow), kerbYellow));
}

/* -------------------------------------------------------------- the shops
   One builder, run once per frontage. Built facing +z in its own frame and
   turned to face the road: ground floor open on to the footpath, the board
   above it, a sunshade over each upper window and, on most roofs, the black
   water tank no Bengaluru building is without.                           */
function buildShopAt(i) {
  const S = SHOPS[i], spot = shopSpot(i), rnd = mulberry32(900 + i * 37);
  const W = PITCH - .25, D = 7, GF = 3.5, FL = 3.0, H = GF + S[5] * FL;
  const g = new THREE.Group();

  const paints = [0x8c8270, 0x6f7f74, 0x8a6f62, 0x7a7f86, 0x8f8a6e, 0x6a6f78];
  const wall = surface(lib('wall', () => texWall()), [1.4, 1.4],
    { color: paints[i % paints.length], roughness: .92, normal: .9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wall);
  body.position.set(0, H / 2, -D / 2); body.castShadow = true; body.receiveShadow = true; g.add(body);

  /* ground floor: an opening, the lit inside or a pulled-down shutter */
  const OW = W - .9, OH = 2.55;
  if (S[6]) {
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(OW, OH),
      new THREE.MeshBasicMaterial({ map: tx(texInterior(70 + i, rnd() > .35)), color: hdr(1.25, 1.12, .98),
        fog: true, toneMapped: false }));
    inside.position.set(0, KERB_H + OH / 2, .02); g.add(inside);
    /* the shutter, rolled up into its box */
    const box = new THREE.Mesh(new THREE.BoxGeometry(OW + .2, .32, .34),
      new THREE.MeshStandardMaterial({ map: tx(lib('shutter', () => texShutter())), color: 0x9aa0a3, roughness: .6, metalness: .5 }));
    box.position.set(0, KERB_H + OH + .16, .12); g.add(box);
    /* light thrown on to the footpath */
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(OW * 1.3, 4.2),
      new THREE.MeshBasicMaterial({ map: tx(lib('spill', () => texGlow('rgba(255,214,150,.85)', 'rgba(255,170,90,.30)'))),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: .55 }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(0, KERB_H + .02, 1.4); spill.renderOrder = 2; g.add(spill);
  } else {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(OW, OH),
      new THREE.MeshStandardMaterial({ map: tx(lib('shutter', () => texShutter()), { wrap: THREE.RepeatWrapping, repeat: [2, 2] }),
        color: 0x8a9094, roughness: .55, metalness: .55 }));
    sh.position.set(0, KERB_H + OH / 2, .03); g.add(sh);
  }

  /* the board: a dark box with the lit flex on its face */
  const BW = W - .3, BH = 1.05, BY = KERB_H + OH + .95;
  const back = new THREE.Mesh(new THREE.BoxGeometry(BW + .1, BH + .1, .16),
    new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: .7, metalness: .3 }));
  back.position.set(0, BY, .16); g.add(back);
  const faceMat = new THREE.MeshBasicMaterial({ map: tx(texBoard(S[1], S[2], S[3], S[4]), { aniso: 16 }),
    color: hdr(1.18, 1.18, 1.18), fog: true, toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), faceMat);
  face.position.set(0, BY, .25); g.add(face);
  WORLD.boards = WORLD.boards || [];
  WORLD.boards.push({ mat: faceMat, base: 1.18, ph: rnd() * TAU, flicker: rnd() < .18 });

  /* upper floors: two windows each, a sunshade over every one */
  const shade = new THREE.MeshStandardMaterial({ color: 0x5d5a55, roughness: .9 });
  for (let f = 0; f < S[5]; f++) {
    const y = GF + f * FL + 1.45;
    [-1, 1].forEach(s => {
      const lit = rnd() > .45;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.35),
        new THREE.MeshBasicMaterial({ map: tx(texWindow(lit, i * 10 + f * 2 + s)), color: lit ? hdr(1.05, 1, .95) : 0xffffff,
          fog: true, toneMapped: !lit }));
      win.position.set(s * W * .24, y, .02); g.add(win);
      const sun = new THREE.Mesh(new THREE.BoxGeometry(1.9, .09, .55), shade);
      sun.position.set(s * W * .24, y + .86, .27); sun.castShadow = true; g.add(sun);
    });
  }
  /* parapet and the tank */
  const par = new THREE.Mesh(new THREE.BoxGeometry(W, .55, .18), wall);
  par.position.set(0, H + .27, -.09); g.add(par);
  if (rnd() > .3) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, 1.15, 18),
      new THREE.MeshStandardMaterial({ color: 0x0d0f10, roughness: .55, metalness: .05 }));
    tank.position.set((rnd() - .5) * W * .5, H + .58, -2.4 - rnd() * 2); tank.castShadow = true; g.add(tank);
  }

  g.position.set(spot.x, 0, spot.z);
  g.rotation.y = spot.side < 0 ? Math.PI / 2 : -Math.PI / 2;
  scene.add(g);
}

/* the wider building that closes the street. Its board is the visitor's:
   it reads "Your shop" until they type their shop's name on the page. */
const ENDBOARD = { canvas: null, tex: null, name: '' };
function drawEndBoard(name) {
  const c = ENDBOARD.canvas || (ENDBOARD.canvas = cvs(1536, 384));
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  const en = (name || '').trim().toUpperCase();
  const fresh = texBoard(en ? 'ನಿಮ್ಮ ಅಂಗಡಿ ಇಲ್ಲಿ' : 'ನಿಮ್ಮ ಅಂಗಡಿ', en || 'YOUR SHOP', '#f2c230', '#a3120f', W, H);
  x.drawImage(fresh, 0, 0);
  if (ENDBOARD.tex) ENDBOARD.tex.needsUpdate = true;
}
function buildEndBuilding() {
  const g = new THREE.Group(), W = 16, H = 10.5, D = 8;
  const wall = surface(lib('wall', () => texWall()), [3, 2], { color: 0x837a69, roughness: .92, normal: .9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wall);
  body.position.set(0, H / 2, -D / 2); body.castShadow = true; g.add(body);
  /* three open bays below */
  for (let k = -1; k <= 1; k++) {
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6),
      new THREE.MeshBasicMaterial({ map: tx(texInterior(300 + k, true)), color: hdr(1.2, 1.08, .94), fog: true, toneMapped: false }));
    inside.position.set(k * 5, 1.5, .02); g.add(inside);
  }
  /* the big board */
  drawEndBoard('');
  ENDBOARD.tex = tx(ENDBOARD.canvas, { aniso: 16 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(12.4, 3.3, .2),
    new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: .7, metalness: .3 }));
  back.position.set(0, 4.9, .2); g.add(back);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(12.0, 3.0),
    new THREE.MeshBasicMaterial({ map: ENDBOARD.tex, color: hdr(1.3, 1.3, 1.3), fog: true, toneMapped: false }));
  face.position.set(0, 4.9, .32); g.add(face);
  WORLD.endBoard = face;
  /* windows above */
  for (let f = 0; f < 2; f++) for (let k = 0; k < 5; k++) {
    const lit = ((k * 7 + f * 3) % 5) < 2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4),
      new THREE.MeshBasicMaterial({ map: tx(texWindow(lit, 500 + f * 9 + k)), color: lit ? hdr(1.05, 1, .95) : 0xffffff, fog: true, toneMapped: !lit }));
    win.position.set(-6 + k * 3, 7.4 + f * 2.2 - 0.5, .02); g.add(win);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 12),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(255,206,110,.75)', 'rgba(240,140,40,.22)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .22 }));
  glow.position.set(0, 4.6, 1.4); glow.renderOrder = 2; g.add(glow);
  WORLD.endGlow = glow;
  g.position.set(0, 0, END_Z);
  scene.add(g);
}
function buildShops() {
  SHOPS.forEach((s, i) => buildShopAt(i));
  buildEndBuilding();
}


/* --------------------------------------------------- the vermilion moon
   Hung well behind the hall so the roof crosses its lower left — near
   enough to the ridge to sit in the mist, far enough that it never moves
   against the buildings when the rig drifts.                             */
const MOON = { x: 17.9, y: 31.9, z: -72, r: 8.6 };
function buildMoon() {
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(MOON.r * 2, MOON.r * 2),
    /* The whole blood-moon grade lives here, on a near-neutral albedo. The
       plate measures G/R ≈ B/R ≈ .48, but that is a *display* ratio: the map
       is decoded out of sRGB before this multiplies it, so the tint has to be
       written in linear, where the same look is ≈ .21. Reading the ratio
       straight off the reference is what left the moon a pale pink. */
    new THREE.MeshBasicMaterial({ map: tx(texMoon()), color: hdr(3.6, 1.50, .50),
      transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  disc.position.set(MOON.x, MOON.y, MOON.z); disc.renderOrder = 1;
  scene.add(disc); WORLD.moon = disc;

  /* the air around it — a wide, weak corona that the bloom picks up */
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(MOON.r * 6.4, MOON.r * 6.4),
    new THREE.MeshBasicMaterial({ map: tx(texGlow('rgba(255,196,128,.90)', 'rgba(224,128,46,.26)')),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .44 }));
  halo.position.set(MOON.x, MOON.y, MOON.z - .3); halo.renderOrder = 0;
  scene.add(halo); WORLD.moonHalo = halo;
}
/* On a tall frame the rig steps back and its horizontal reach narrows, which
   would slide the moon off the right edge — draw it in by the same amount. */
function placeMoon() {
  if (!WORLD.moon) return;
  const x = MOON.x * (1 - .40 * aspectFix());
  WORLD.moon.position.x = x;
  WORLD.moonHalo.position.x = x;
}

/* ------------------------------------------------- the festival arch
   Two cloth-wrapped posts at the kerbs, the yellow-over-red banner of the
   Rajyotsava between them with ಸುಸ್ವಾಗತ (welcome) on it, a toran of mango
   leaves along its foot and a bow of bulbs over the top.                  */
function texBanner() {
  const W = 1536, H = 256, c = cvs(W, H), x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, W, H / 2);
  x.fillStyle = '#c4161c'; x.fillRect(0, H / 2, W, H / 2);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 150px ' + KN;
  x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = '#5a0a0a';
  x.strokeText('ಸುಸ್ವಾಗತ', W / 2, H * .50);
  x.fillStyle = '#fffaf0'; x.fillText('ಸುಸ್ವಾಗತ', W / 2, H * .50);
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = .25;
  x.drawImage(fbmCanvas(256, 48, 4417, 4, 3, 1.2), 0, 0, W, H);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return c;
}

/* every bulb on the street is one instance of one mesh, so the whole
   festival costs a single draw call and can chase in one loop */
const BULBS = { pos: [], col: [], ph: [], mesh: null };
const BULB_COLS = [[2.6, 1.7, .7], [2.6, 1.7, .7], [2.8, 1.2, .4], [2.4, .5, .4], [.6, 2.0, .9], [.6, 1.1, 2.6], [2.6, 2.2, 1.6]];
function bulb(x, y, z, k) {
  BULBS.pos.push(x, y, z);
  BULBS.col.push(BULB_COLS[k % BULB_COLS.length]);
  BULBS.ph.push(BULBS.ph.length);
}
function catenary(a, b, sag, n, fn) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    fn(lerp(a.x, b.x, t), lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag, lerp(a.z, b.z, t), i);
  }
}
const WIRE = new THREE.LineBasicMaterial({ color: 0x050607 });
function wire(a, b, sag) {
  const pts = [];
  catenary(a, b, sag, 24, (x, y, z) => pts.push(new THREE.Vector3(x, y, z)));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), WIRE));
}

function buildArch() {
  const g = new THREE.Group();
  const X = ROAD_W / 2 - .25, TOP = 6.9;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x9b1414, roughness: .85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x9a7a2e, roughness: .45, metalness: .6 });
  [-1, 1].forEach(s => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.42, TOP, .42), cloth);
    post.position.set(s * X, TOP / 2, 0); post.castShadow = true; g.add(post);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.42, .9, 4), gold);
    cap.position.set(s * X, TOP + 2.3, 0); cap.rotation.y = Math.PI / 4; g.add(cap);
    /* a spiral of bulbs up each post */
    for (let k = 0; k < 34; k++) {
      const a = k * .9, y = .6 + k * .18;
      bulb(s * X + Math.cos(a) * .3, y, ARCH_Z + Math.sin(a) * .3, k);
    }
  });
  /* the banner */
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(X * 2 + .4, 1.7),
    new THREE.MeshStandardMaterial({ map: tx(texBanner(), { aniso: 16 }), roughness: .8, side: THREE.DoubleSide,
      emissive: 0xffffff, emissiveMap: tx(texBanner()), emissiveIntensity: .28 }));
  banner.position.set(0, TOP + .85 - .1, 0); g.add(banner);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(X * 2 + .9, .22, .3), gold);
  beam.position.set(0, TOP + 1.78, 0); g.add(beam);
  /* the bow of bulbs over the banner */
  const bow = [];
  for (let k = 0; k <= 48; k++) {
    const t = k / 48 * Math.PI, x = Math.cos(t) * X, y = TOP + 1.9 + Math.sin(t) * 1.6;
    bow.push(new THREE.Vector3(x, y, 0));
    bulb(x, y, ARCH_Z, k + 3);
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 48, .05, 6, false), gold));
  /* the toran: mango leaves hung point-down along the foot of the banner */
  const leaf = cvs(64, 128), lx = leaf.getContext('2d');
  lx.fillStyle = '#2f6b1f'; lx.beginPath(); lx.moveTo(32, 128); lx.quadraticCurveTo(0, 50, 32, 0);
  lx.quadraticCurveTo(64, 50, 32, 128); lx.fill();
  lx.strokeStyle = '#7fae4a'; lx.lineWidth = 2; lx.beginPath(); lx.moveTo(32, 4); lx.lineTo(32, 124); lx.stroke();
  const N = 44, toran = new THREE.InstancedMesh(new THREE.PlaneGeometry(.2, .42),
    new THREE.MeshStandardMaterial({ map: tx(leaf), alphaTest: .4, side: THREE.DoubleSide, roughness: .8 }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < N; k++) {
    const x = -X + (k + .5) / N * X * 2;
    e.set(0, 0, Math.sin(k * 2.1) * .12); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, TOP - .25, .04), q, one);
    toran.setMatrixAt(k, m4);
  }
  g.add(toran);
  WORLD.archLeaves = toran;
  g.position.set(0, 0, ARCH_Z);
  scene.add(g); WORLD.arch = g;
}

/* string lights strung across the road between the shop rows, the way the
   streets dress up for every festival */
function buildStreetLights() {
  [-3.6, -18.0, -24.0, -30.0, -36.0].forEach((z, r) => {
    const a = new THREE.Vector3(-ROW_X + .3, 7.1 + (r % 2) * .4, z), b = new THREE.Vector3(ROW_X - .3, 7.3 - (r % 2) * .3, z - 1.2);
    wire(a, b, 1.1);
    catenary(a, b, 1.1, 34, (x, y, zz, i) => { if (i % 1 === 0) bulb(x, y - .08, zz, i + r * 2); });
  });
  /* plain cables too, sagging between the roofs */
  wire(new THREE.Vector3(-ROW_X, 8.9, -6), new THREE.Vector3(ROW_X, 9.4, -4), .9);
  wire(new THREE.Vector3(-ROW_X, 9.6, -12.5), new THREE.Vector3(ROW_X, 8.7, -13.2), 1.2);
  wire(new THREE.Vector3(-ROW_X, 9.1, -27), new THREE.Vector3(ROW_X, 9.8, -28), 1.0);
}
function finishBulbs() {
  const n = BULBS.pos.length / 3;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true }), n);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(BULBS.pos[i * 3], BULBS.pos[i * 3 + 1], BULBS.pos[i * 3 + 2]);
    mesh.setMatrixAt(i, m4);
    c.setRGB(BULBS.col[i][0], BULBS.col[i][1], BULBS.col[i][2]); mesh.setColorAt(i, c);
  }
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  scene.add(mesh); BULBS.mesh = mesh;
}
/* a slow chase: a third of the bulbs dim and the dip walks along the strings */
let BULB_ACC = 0, BULB_STEP = 0;
function updateBulbs(dt) {
  if (!BULBS.mesh || REDUCE) return;
  BULB_ACC += dt; if (BULB_ACC < .14) return;
  BULB_ACC = 0; BULB_STEP++;
  const c = new THREE.Color(), arr = BULBS.col;
  for (let i = 0; i < arr.length; i++) {
    const k = ((i + BULB_STEP) % 3 === 0) ? .28 : 1;
    c.setRGB(arr[i][0] * k, arr[i][1] * k, arr[i][2] * k);
    BULBS.mesh.setColorAt(i, c);
  }
  BULBS.mesh.instanceColor.needsUpdate = true;
}

/* --------------------------------------------------- the sodium lamps
   A tall pole at the kerb, an arm reaching over the road, and the orange
   cone the drizzle makes visible under every head.                       */
function buildLamp(side, z, withLight) {
  const g = new THREE.Group(), H = 7.4, REACH = 2.1;
  const metal = lib('lampMetal', () => new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: .55, metalness: .6 }));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, H, 10), metal);
  pole.position.y = H / 2; pole.castShadow = true; g.add(pole);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, H - .4, 0), new THREE.Vector3(0, H + .35, 0), new THREE.Vector3(REACH, H + .2, 0)), 12, .045, 6), metal);
  g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.72, .16, .3), metal);
  head.position.set(REACH, H + .12, 0); g.add(head);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(.6, .22),
    new THREE.MeshBasicMaterial({ color: hdr(3.4, 1.55, .42), toneMapped: false, fog: false }));
  lens.rotation.x = Math.PI / 2; lens.position.set(REACH, H + .035, 0); g.add(lens);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: tx(lib('sodium', () => texGlow('rgba(255,170,70,.95)', 'rgba(255,110,30,.32)'))),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .62 }));
  glow.position.set(REACH, H, 0); glow.renderOrder = 3; g.add(glow);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, H, 24, 1, true),
    lib('coneMat', () => new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: .035,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })));
  cone.position.set(REACH, H / 2, 0); cone.renderOrder = 3; g.add(cone);
  WORLD.lampGlows = WORLD.lampGlows || []; WORLD.lampGlows.push(glow);
  if (withLight) {
    const lt = new THREE.PointLight(0xff9440, 3.6, 17, 2);
    lt.position.set(REACH, H - .3, 0); g.add(lt);
    WORLD.lampLights = WORLD.lampLights || []; WORLD.lampLights.push(lt);
  }
  g.position.set(side * (ROAD_W / 2 + .45), KERB_H, z);
  g.rotation.y = side < 0 ? 0 : Math.PI;
  scene.add(g);
}

/* ------------------------------------------------------- the autos
   Green below, yellow above, a black hood: parked against the kerb with
   the meter off. Built from a dozen boxes; the silhouette is the point.  */
function buildAuto(x, z, rot) {
  const g = new THREE.Group();
  const green = lib('autoGreen', () => new THREE.MeshStandardMaterial({ color: 0x1d6b34, roughness: .4, metalness: .25 }));
  const yellow = lib('autoYellow', () => new THREE.MeshStandardMaterial({ color: 0xd9ab1f, roughness: .4, metalness: .2 }));
  const black = lib('autoBlack', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .8 }));
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(1.32, .42, 1.5), green, 0, .62, -.45);          /* passenger tub   */
  add(new THREE.BoxGeometry(1.32, .2, 1.5), yellow, 0, .93, -.45);           /* the yellow band */
  add(new THREE.BoxGeometry(.74, .62, .62), yellow, 0, .82, .82);            /* the cowl        */
  add(new THREE.BoxGeometry(.9, .34, .2), green, 0, .5, 1.05);               /* the nose        */
  add(new THREE.BoxGeometry(1.36, .07, 2.15), black, 0, 1.86, -.15);         /* hood            */
  add(new THREE.BoxGeometry(1.36, .9, .08), black, 0, 1.42, -1.2);           /* hood's back     */
  [-1, 1].forEach(s => add(new THREE.BoxGeometry(.05, .85, .05), black, s * .64, 1.42, .78));
  add(new THREE.BoxGeometry(1.2, .55, .05), black, 0, 1.45, .82).material = lib('glass',
    () => new THREE.MeshStandardMaterial({ color: 0x1a2a30, roughness: .1, metalness: .6, transparent: true, opacity: .55 }));
  const wheel = lib('wheel', () => new THREE.CylinderGeometry(.24, .24, .14, 14).rotateZ(Math.PI / 2));
  add(wheel, black, 0, .24, 1.05); add(wheel, black, -.6, .24, -.8); add(wheel, black, .6, .24, -.8);
  const lamp = add(new THREE.CircleGeometry(.08, 12),
    new THREE.MeshBasicMaterial({ color: hdr(1.6, 1.4, 1.0), toneMapped: false }), 0, .78, 1.16);
  lamp.castShadow = false;
  g.position.set(x, 0, z); g.rotation.y = rot;
  scene.add(g);
}


function buildMaple(seed, x, z, scale) {
  const rnd = mulberry32(seed);
  const parts = [], tips = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), pos = new THREE.Vector3();

  function seg(from, to, r0, r1) {
    dir.subVectors(to, from);
    const len = dir.length(); dir.normalize();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
    Q.setFromUnitVectors(UP, dir);
    pos.addVectors(from, to).multiplyScalar(.5);
    M.compose(pos, Q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(M);
    parts.push(geo);
  }
  function branch(from, dirV, len, rad, depth) {
    const to = from.clone().addScaledVector(dirV, len);
    to.y += len * .10;
    seg(from, to, rad, rad * .68);
    if (depth >= 4 || len < .34) { tips.push(to.clone()); return; }
    const n = depth < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d = dirV.clone();
      d.x += (rnd() - .5) * 1.25; d.z += (rnd() - .5) * 1.25; d.y += .30 + rnd() * .5;
      d.normalize();
      branch(to, d, len * (.62 + rnd() * .16), rad * .66, depth + 1);
    }
  }
  const root = new THREE.Vector3(0, 0, 0);
  seg(root, new THREE.Vector3(0, 1.5, 0), .22, .16);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + rnd();
    branch(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(Math.cos(a) * .8, .8, Math.sin(a) * .8).normalize(), 1.45, .155, 0);
  }
  const trunk = new THREE.Mesh(mergeGeos(parts),
    new THREE.MeshStandardMaterial({ color: 0x171413, roughness: .94, metalness: .0, side: THREE.DoubleSide }));
  trunk.castShadow = true;

  const leafGeo = new THREE.PlaneGeometry(.36, .36);
  const leafMat = new THREE.MeshStandardMaterial({
    map: tx(lib('petal', () => texPetal())), color: 0xa01a08, alphaTest: .42, side: THREE.DoubleSide,
    roughness: .86, metalness: 0, emissive: 0x3e0700, emissiveIntensity: .34
  });
  const per = LOW ? 5 : 9;
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, tips.length * per);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3();
  let k = 0;
  tips.forEach(t => {
    for (let i = 0; i < per; i++) {
      const p = new THREE.Vector3(t.x + (rnd() - .5) * .95, t.y + (rnd() - .5) * .8, t.z + (rnd() - .5) * .95);
      e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      q2.setFromEuler(e);
      const s = .7 + rnd() * .75; sc.set(s, s, s);
      m4.compose(p, q2, sc);
      inst.setMatrixAt(k++, m4);
    }
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = false; inst.frustumCulled = false;

  const g = new THREE.Group();
  g.add(trunk); g.add(inst);
  g.position.set(x, 0, z); g.scale.setScalar(scale || 1);
  g.rotation.y = rnd() * TAU;
  scene.add(g);
  /* leaves breathe in the wind */
  leafMat.onBeforeCompile = sh => {
    sh.uniforms.uT = WORLD.uT;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;\n' +
      'float ph = wp.x*1.7 + wp.z*1.3 + wp.y*.7;\n' +
      'transformed.x += sin(uT*1.35 + ph)*0.055;\n' +
      'transformed.z += cos(uT*1.05 + ph*1.3)*0.045;\n');
  };
  return g;
}


/* ------------------------------- the transparent-PNG foreground layers */
function cutoutMaterial(canvasEl, sway) {
  const mat = new THREE.MeshBasicMaterial({
    map: tx(canvasEl, { aniso: 16 }), transparent: true, depthWrite: true,
    alphaTest: .012, side: THREE.DoubleSide, fog: true, color: 0xffffff
  });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = WORLD.uT;
    sh.uniforms.uSway = { value: sway || .07 };
    sh.vertexShader = 'uniform float uT;\nuniform float uSway;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float h = uv.y;\n' +
      'float ph = position.x*0.30 + float(gl_InstanceID)*0.0;\n' +
      'transformed.x += sin(uT*0.85 + ph)*uSway*h*h;\n' +
      'transformed.y += cos(uT*0.62 + ph*1.7)*uSway*0.35*h*h;\n');
    /* These plates are drawn to the edge of their own canvas — the grass runs
       straight off the left and the bottom — so every sheet ends on a hard
       straight line wherever its plane stops. Feathering the alpha at the
       edges lets each one dissolve into the scene instead of being cut out of
       it. Sides get the widest margin because that is where a bank of grass
       is read as ending; the crest needs none, the blades already taper. */
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>',
      'float feX = smoothstep(0.0, 0.11, vUv.x) * (1.0 - smoothstep(0.89, 1.0, vUv.x));\n' +
      'float feY = smoothstep(0.0, 0.07, vUv.y);\n' +
      'diffuseColor.a *= feX * feY;\n' +
      '#include <alphatest_fragment>');
  };
  return mat;
}

function buildForeground() {
  /* the plane widths are sized against the frustum at their own depth: a
     26-unit sheet two metres from the lens only shows its middle tenth */
  const layers = [
    /* name        canvas                                                                     x     y     z     w     h   sway */
    ['grassFar',  texGrassCutout(101, { crest: .30, peak: .46, wide: .42, blades: 11000, len: 34, warm: .70, crest2: .46, crest3: .40 }),
                  -11.0, 1.60, -0.4, 16, 10, .040],
    ['grassMid',  texGrassCutout(202, { crest: .60, peak: .55, wide: .40, blades: 13000, len: 40, warm: .95, crest2: -.44, crest3: .34 }),
                   8.6,  1.70,  3.6, 11,  6.5, .062],
    ['grassNear', texGrassCutout(303, { crest: .42, peak: .62, wide: .48, blades: 16000, len: 50, warm: .85, crest2: .42, crest3: .44 }),
                  -6.6,  2.10,  5.6, 9,  5.4, .092],
    ['bough',     texBranchCutout(505), 4.6, 2.95, 6.4, 13, 8.7, .045]
  ];
  WORLD.fg = [];
  layers.forEach(L => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L[5], L[6], 12, 12), cutoutMaterial(L[1], L[7]));
    m.position.set(L[2], L[3], L[4]);
    m.renderOrder = 20 + WORLD.fg.length;
    m.name = L[0];
    m.frustumCulled = false;
    scene.add(m);
    WORLD.fg.push(m);
  });
}

/* --------------------------------------------------- the giant wordmark */
const WORD_Z = 3.0;
function buildWordmark() {
  /* The word is set to the frame width, so a short word is a *taller* word.
     Four letters at the old tracking put a 400-pixel cap height across the
     scene; the letters are spaced out instead, which keeps the type edge to
     edge while the caps come back down to the height of the headline block. */
  const SZ = 320, TRACK = .30, PAD = 26;
  const m = cvs(4, 4).getContext('2d');
  m.font = '900 ' + SZ + 'px Wordmark, sans-serif';
  m.textBaseline = 'alphabetic'; m.textAlign = 'left';
  const word = 'ADITHYA', gl = [];
  let pen = 0, ascMax = 0, descMax = 0, xMin = 1e9, xMax = -1e9;
  for (const ch of word) {
    const t = m.measureText(ch);
    const g = { ch: ch, adv: t.width, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent,
                l: t.actualBoundingBoxLeft, r: t.actualBoundingBoxRight, pen: pen };
    gl.push(g);
    ascMax = Math.max(ascMax, g.asc); descMax = Math.max(descMax, g.desc);
    xMin = Math.min(xMin, pen - g.l); xMax = Math.max(xMax, pen + g.r);
    pen += t.width + TRACK * SZ;
  }
  const group = new THREE.Group();
  WORD.glyphs = [];
  gl.forEach((g, i) => {
    const cw = Math.ceil(g.l + g.r) + PAD * 2, chh = Math.ceil(g.asc + g.desc) + PAD * 2;
    const c = cvs(cw, chh), x = c.getContext('2d');
    x.font = '900 ' + SZ + 'px Wordmark, sans-serif';
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    /* the vertical wash is baked per glyph so the whole word shares one ramp */
    const gy0 = PAD + g.asc - ascMax, gy1 = PAD + g.asc + descMax * .4;
    const grad = x.createLinearGradient(0, gy0, 0, gy1);
    grad.addColorStop(0, 'rgb(250,240,218)');
    grad.addColorStop(.52, 'rgb(232,206,160)');
    grad.addColorStop(1, 'rgb(170,128,84)');
    x.fillStyle = grad;
    x.fillText(g.ch, PAD + g.l, PAD + g.asc);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cw, chh),
      new THREE.MeshBasicMaterial({ map: tx(c, { aniso: 16 }), transparent: true,
        depthWrite: false, side: THREE.DoubleSide, fog: true, opacity: 1 }));
    mesh.position.set(g.pen + (g.r - g.l) / 2, (g.asc - g.desc) / 2 + (PAD - PAD) , 0);
    mesh.position.y = (g.asc - g.desc) / 2;
    mesh.renderOrder = 12;
    mesh.frustumCulled = false;
    mesh.userData.baseY = mesh.position.y;
    group.add(mesh);
    WORD.glyphs.push(mesh);
  });
  group.position.z = WORD_Z;
  scene.add(group);
  WORD.group = group;
  WORD.ink = { xMin: xMin, xMax: xMax, cx: (xMin + xMax) / 2, w: xMax - xMin, asc: ascMax };
}
const WORD = { glyphs: [], group: null, ink: null, reveal: 0 };

/* --------------------------------------------------------- atmospherics */
function buildAtmosphere() {
  /* drifting haze slabs */
  const hazeTex = tx(texGlow('rgba(160,205,210,.55)', 'rgba(110,165,175,.18)'));
  WORLD.haze = [];
  const rnd = mulberry32(66);
  for (let i = 0; i < (LOW ? 4 : 6); i++) {
    const s = 12 + rnd() * 15;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(s, s * .55),
      new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, opacity: .05 + rnd() * .07 }));
    h.position.set((rnd() - .5) * 44, 1.5 + rnd() * 10, -38 + rnd() * 40);
    h.renderOrder = 4;
    h.userData = { sp: .06 + rnd() * .12, ph: rnd() * TAU, x0: h.position.x };
    scene.add(h); WORLD.haze.push(h);
  }

  /* embers around the lantern and the disc */
  const N = LOW ? 220 : 460;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() - .5) * 30; pos[i * 3 + 1] = rnd() * 11; pos[i * 3 + 2] = -26 + rnd() * 36;
    seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const emb = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uT: WORLD.uT, uTex: { value: tx(texGlow('rgba(255,190,140,1)', 'rgba(255,120,60,.35)')) },
      uSize: { value: vpH() * .5 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader:
      'attribute float aSeed; uniform float uT; uniform float uSize; varying float vA;\n' +
      'void main(){ vec3 p=position;\n' +
      ' p.y = mod(p.y + uT*(0.14+aSeed*0.28), 11.5);\n' +
      ' p.x += sin(uT*0.36 + aSeed*22.0)*0.85;\n' +
      ' p.z += cos(uT*0.29 + aSeed*17.0)*0.7;\n' +
      ' vec4 mv = modelViewMatrix * vec4(p,1.0);\n' +
      ' vA = (0.25+aSeed*0.75) * smoothstep(11.5,7.0,p.y) * smoothstep(0.0,1.4,p.y);\n' +
      ' gl_PointSize = uSize*(0.010+aSeed*0.020)/max(-mv.z,0.6);\n' +
      ' gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'uniform sampler2D uTex; varying float vA;\n' +
      'void main(){ vec4 t=texture2D(uTex, gl_PointCoord);\n' +
      ' gl_FragColor = vec4(t.rgb*vec3(1.6,0.78,0.42), t.a*vA*0.75); }'
  }));
  emb.frustumCulled = false; emb.renderOrder = 5;
  scene.add(emb); WORLD.embers = emb;

  /* rain in the slot of open sky */
  if (!LOW) {
    const D = 900, rp = new Float32Array(D * 2 * 3), rt = new Float32Array(D * 2), rs = new Float32Array(D * 2), rl = new Float32Array(D * 2);
    for (let i = 0; i < D; i++) {
      const x = (rnd() - .5) * 40, z = -30 + rnd() * 34, y = rnd() * 17, sp = 7 + rnd() * 9, ln = .30 + rnd() * .55;
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        rp[o] = x; rp[o + 1] = y; rp[o + 2] = z;
        rt[i * 2 + k] = k; rs[i * 2 + k] = sp; rl[i * 2 + k] = ln;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('aTop', new THREE.BufferAttribute(rt, 1));
    rg.setAttribute('aSpeed', new THREE.BufferAttribute(rs, 1));
    rg.setAttribute('aLen', new THREE.BufferAttribute(rl, 1));
    const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: { uT: WORLD.uT },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader:
        'attribute float aTop; attribute float aSpeed; attribute float aLen; uniform float uT; varying float vA;\n' +
        'void main(){ vec3 p=position;\n' +
        ' float y = mod(p.y - uT*aSpeed, 17.0);\n' +
        ' p.y = y + aTop*aLen;\n' +
        ' vA = smoothstep(0.0,3.0,y)*smoothstep(17.0,11.0,y);\n' +
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: 'varying float vA;\nvoid main(){ gl_FragColor = vec4(0.55,0.74,0.82, vA*0.024); }'
    }));
    rain.frustumCulled = false; rain.renderOrder = 6;
    scene.add(rain); WORLD.rain = rain;
  }

  /* ripples on the standing water */
  const ringC = cvs(256, 256), rx2 = ringC.getContext('2d');
  const rg2 = rx2.createRadialGradient(128, 128, 84, 128, 128, 128);
  rg2.addColorStop(0, 'rgba(255,255,255,0)'); rg2.addColorStop(.62, 'rgba(255,255,255,.55)');
  rg2.addColorStop(.86, 'rgba(255,255,255,.22)'); rg2.addColorStop(1, 'rgba(255,255,255,0)');
  rx2.fillStyle = rg2; rx2.fillRect(0, 0, 256, 256);
  const ringTex = tx(ringC);
  WORLD.ripples = [];
  for (let i = 0; i < (LOW ? 6 : 13); i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: true, opacity: 0 }));
    r.rotation.x = -Math.PI / 2; r.renderOrder = 7;
    r.userData = { t: rnd() * 4, x: (rnd() - .5) * 22, z: -8 + rnd() * 22, sp: .5 + rnd() * .5 };
    scene.add(r); WORLD.ripples.push(r);
  }
}

/* ====================================================== 6b · the leaf fall
   The maples shed all the way through the chapter. The fall is anchored to
   the rig rather than to the court: every leaf keeps a real world position so
   its drift is honest, but any leaf that ends up further than LEAF_R from the
   camera in x or z is wrapped back across it. That way the count is what one
   screenful needs — a hundred and seventy — instead of what filling the whole
   valley would cost, and the frame is never empty however far the walk goes.

   A falling leaf is read by its tumble, not by its path. Each one turns on
   two axes at its own rate, so it presents its face, thins to an edge and
   comes back — which is the whole reason these are instanced quads and not
   points, since a point sprite cannot turn away from the camera. */
/* LEAF_AHEAD/LEAF_SPREAD is the disc leaves are recycled into, hung down the
   camera's own sight line; LEAF_R is only the far backstop for a rig that has
   walked out from under its weather. */
const LEAF_AHEAD = 11, LEAF_SPREAD = 12, LEAF_R = 30;
function buildLeafFall() {
  const N = LOW ? 110 : 260;
  const mat = new THREE.MeshStandardMaterial({
    map: tx(lib('petal', () => texPetal())), alphaTest: .42, side: THREE.DoubleSide,
    color: 0x7a1606, roughness: .84, metalness: 0,
    /* green and blue driven to nothing: the composite tone-maps at the end,
       and an emissive red with any green in it comes back out of that pink */
    emissive: 0x8a2600, emissiveIntensity: .62
  });
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(.26, .26), mat, N);
  inst.frustumCulled = false; inst.renderOrder = 5;
  inst.castShadow = inst.receiveShadow = false;
  const rnd = mulberry32(404), list = [];
  for (let i = 0; i < N; i++) list.push({
    x: (rnd() - .5) * 2 * LEAF_R, z: (rnd() - .5) * 2 * LEAF_R, y: rnd() * 26,
    fall: .5 + rnd() * .9,
    sway: .45 + rnd() * 1.5, swayPh: rnd() * TAU, swayAmp: .30 + rnd() * .95,
    spin: (rnd() - .5) * 2.6, roll: rnd() * TAU, rollSp: .5 + rnd() * 2.0,
    tilt: rnd() * TAU, s: .55 + rnd() * .9
  });
  scene.add(inst);
  WORLD.leaves = { mesh: inst, list: list };
}
const LEAF_M = new THREE.Matrix4(), LEAF_Q = new THREE.Quaternion();
const LEAF_E = new THREE.Euler(), LEAF_P = new THREE.Vector3(), LEAF_S = new THREE.Vector3();
const LEAF_F = new THREE.Vector3();
function updateLeaves(dt) {
  const LV = WORLD.leaves; if (!LV) return;
  const cy = camera.position.y, L = LV.list;
  /* Respawn ahead of the rig, not around it. A band centred on the camera
     spends nearly all of itself behind and beside the frustum — of a couple of
     hundred leaves only a dozen were ever on screen. Recycling them into the
     cone the camera is actually looking down puts the same count in frame
     several times over, and costs nothing. */
  camera.getWorldDirection(LEAF_F);
  LEAF_F.y = 0;
  if (LEAF_F.lengthSq() < 1e-6) LEAF_F.set(0, 0, -1); else LEAF_F.normalize();
  const fx = camera.position.x + LEAF_F.x * LEAF_AHEAD;
  const fz = camera.position.z + LEAF_F.z * LEAF_AHEAD;
  const seed = !LV.seeded; LV.seeded = true;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    l.y -= l.fall * dt;
    l.roll += l.rollSp * dt;
    l.tilt += l.spin * dt;
    if (seed || l.y < cy - 10) {                /* back to the top of the band */
      l.y = seed ? cy - 10 + Math.random() * 26 : cy + 16;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * LEAF_SPREAD;
      l.x = fx + Math.cos(a) * r;
      l.z = fz + Math.sin(a) * r;
    }
    /* the far wrap is a backstop for a rig that has walked away from its own
       leaves — it sits well outside the fog, so nothing is seen to jump */
    const cx = camera.position.x, cz = camera.position.z;
    if (l.x - cx > LEAF_R) l.x -= 2 * LEAF_R; else if (l.x - cx < -LEAF_R) l.x += 2 * LEAF_R;
    if (l.z - cz > LEAF_R) l.z -= 2 * LEAF_R; else if (l.z - cz < -LEAF_R) l.z += 2 * LEAF_R;
    /* the side-slip of a leaf shedding air off one edge, then the other */
    const sw = Math.sin(clock * l.sway + l.swayPh);
    LEAF_P.set(l.x + sw * l.swayAmp, l.y,
               l.z + Math.cos(clock * l.sway * .7 + l.swayPh) * l.swayAmp * .6);
    LEAF_E.set(l.roll, l.tilt, sw * .55);
    LEAF_Q.setFromEuler(LEAF_E);
    LEAF_S.setScalar(l.s);
    LEAF_M.compose(LEAF_P, LEAF_Q, LEAF_S);
    LV.mesh.setMatrixAt(i, LEAF_M);
  }
  LV.mesh.instanceMatrix.needsUpdate = true;
}

/* ==================================================== 6c · the cursor wisps
   A drift of cold motes that follows the pointer.

   It hangs as a child of the camera, so the pointer maps straight into camera
   space through the frustum's own half-height. Unprojecting onto a world
   plane each frame would instead pin the trail to the court, and the rig is
   always drifting — the wisps would swim across the screen whenever the
   camera moved rather than staying under the hand.

   Emission is by distance travelled, not elapsed time. A slow hand then lays
   a continuous drift and a fast one throws the motes apart, which is how a
   moving source actually sheds them; emitting on a timer gives an evenly
   spaced string of beads at every speed. */
const WISP_D = 3.4;
const WISP = { list: [], i: 0, acc: 0, ex: 0, ey: 0, lx: 0, ly: 0, idle: 0, seen: false };
function buildWisps() {
  if (COARSE) return;
  /* The motes are round, so nothing here is oriented: no per-particle angle,
     no rotated lookup. They are also small — a few pixels of core inside a
     faint halo — which is what lets the count go up without the additive fill
     that a screenful of big sprites costs. */
  const N = LOW ? 90 : 190;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(N), 1));
  g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(N), 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tx(texWisp()) }, uPx: { value: vpH() } },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, fog: false,
    vertexShader:
      'attribute float aA; attribute float aS;\n' +
      'uniform float uPx; varying float vA;\n' +
      'void main(){ vA = aA;\n' +
      ' vec4 mv = modelViewMatrix * vec4(position,1.0);\n' +
      ' gl_PointSize = uPx * aS / max(-mv.z, 0.4);\n' +
      ' gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'uniform sampler2D uTex; varying float vA;\n' +
      'void main(){ if (vA <= 0.0) discard;\n' +
      ' vec4 t = texture2D(uTex, gl_PointCoord);\n' +
      ' gl_FragColor = vec4(t.rgb, t.a * vA); }'
  }));
  pts.frustumCulled = false; pts.renderOrder = 9;
  pts.layers.set(1);                    /* near the lens: never in the mirror */
  camera.add(pts);
  WISP.mesh = pts;
  for (let i = 0; i < N; i++) WISP.list.push({ life: 0, max: 1, vx: 0, vy: 0, sz: 0, ph: 0 });
}
/* the pointer, in camera space, on the plane the trail hangs on */
function wispPoint(nx, ny) {
  const hh = Math.tan(camera.fov * Math.PI / 360) * WISP_D;
  return [nx * hh * camera.aspect, ny * hh];
}
function updateWisps(dt) {
  if (!WISP.mesh) return;
  const g = WISP.mesh.geometry;
  const P = g.attributes.position.array, A = g.attributes.aA.array;
  const S = g.attributes.aS.array;
  const L = WISP.list, N = L.length;

  const pt = wispPoint(RIG.tmx, RIG.tmy);
  if (!WISP.seen) { WISP.ex = WISP.lx = pt[0]; WISP.ey = WISP.ly = pt[1]; WISP.seen = true; }
  /* the emitter trails the pointer slightly, which is what gives the drift
     its lag on a fast flick instead of snapping rigidly to the cursor */
  WISP.ex = damp(WISP.ex, pt[0], 16, dt);
  WISP.ey = damp(WISP.ey, pt[1], 16, dt);

  const dx = WISP.ex - WISP.lx, dy = WISP.ey - WISP.ly;
  const moved = Math.hypot(dx, dy);
  const ang = moved > 1e-5 ? Math.atan2(dy, dx) : 0;
  const spawn = (x, y, a, weak) => {
    const i = WISP.i; WISP.i = (i + 1) % N;      /* slot and state must pair:
       advancing first would put the position in the next slot and the life in
       this one, and every mote appears where the one before it started */
    const w = L[i], k = i * 3;
    /* The plane the trail hangs on is only about 2.2 units tall, so the
       scatter has to be read against that: a few hundredths of a unit is a
       thread stitched to the cursor, not a drift of motes. */
    P[k] = x + (Math.random() + Math.random() - 1) * .30;
    P[k + 1] = y + (Math.random() + Math.random() - 1) * .30;
    P[k + 2] = -WISP_D + (Math.random() - .5) * .9;
    w.life = 0; w.max = (weak ? 2.1 : 1.45) + Math.random() * 1.3;
    w.vx = -Math.cos(a) * .09 + (Math.random() - .5) * .38;
    w.vy = -Math.sin(a) * .09 + (Math.random() - .5) * .32 + .02;
    w.sz = (weak ? .018 : .024) + Math.random() * .026;
    w.ph = Math.random() * TAU;
  };

  WISP.acc += moved;
  const STEP = .030;
  let guard = 0;
  while (WISP.acc >= STEP && guard++ < 14) {
    WISP.acc -= STEP;
    /* lay each one at the distance along the segment it is actually owed, so a
       flick draws a spaced-out line instead of a clump at one end of it */
    const t = moved > 1e-6 ? Math.min(1, guard * STEP / moved) : 0;
    spawn(WISP.lx + dx * t, WISP.ly + dy * t, ang, false);
  }
  /* the faintest breath when the hand is still, so the cursor keeps an aura.
     Rarely, and barely buoyant: emit often here and a stationary pointer
     grows a permanent column of smoke up the middle of the frame. */
  WISP.idle += dt;
  if (WISP.idle > .42) { WISP.idle = 0; spawn(WISP.ex, WISP.ey, Math.random() * TAU, true); }
  WISP.lx = WISP.ex; WISP.ly = WISP.ey;

  for (let i = 0; i < N; i++) {
    const w = L[i], k = i * 3;
    if (w.life >= w.max) { A[i] = 0; continue; }
    w.life += dt;
    const u = w.life / w.max;
    /* curl, so the drift frays rather than blowing along one straight line */
    P[k]     += (w.vx + Math.sin(clock * 1.3 + w.ph) * .17) * dt;
    P[k + 1] += (w.vy + Math.cos(clock * 1.1 + w.ph * 1.7) * .14) * dt;
    /* light damping: they have to coast to carry the scatter outward, where
       the old rate stopped every mote within a tenth of a unit of its spawn */
    w.vx *= 1 - .5 * dt; w.vy = w.vy * (1 - .5 * dt) + .022 * dt;    /* it rises */
    A[i] = smooth(0, .12, u) * (1 - smooth(.22, 1, u)) * .9;
    S[i] = w.sz * (1 + u * .55);       /* a mote softens, it does not swell */
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.aA.needsUpdate = true;
  g.attributes.aS.needsUpdate = true;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x5f7590, 0x0a0806, .16));

  /* moonlight: cool, from high on the right, the only light that casts */
  const key = new THREE.DirectionalLight(0xa9c2df, .62);
  key.position.set(8, 30, 4);
  key.target.position.set(0, 0, -18); scene.add(key.target);
  if (WANT_SHADOW) {
    key.castShadow = true;
    const S = LOW ? 1024 : 2048;
    key.shadow.mapSize.set(S, S);
    const c = key.shadow.camera;
    c.left = -22; c.right = 22; c.top = 34; c.bottom = -30; c.near = 3; c.far = 80;
    key.shadow.bias = -0.0012; key.shadow.normalBias = .035; key.shadow.radius = 2.2;
  }
  scene.add(key); WORLD.key = key;

  /* a warm rim off the moon, so the rooflines do not go flat against the sky */
  const moonKey = new THREE.DirectionalLight(0xffa064, .36);
  moonKey.position.set(26, 30, -60);
  moonKey.target.position.set(0, 6, -30); scene.add(moonKey.target);
  scene.add(moonKey);

  /* the shops' own light on the footpaths: two long washes per side */
  [-1, 1].forEach(s => [-8, -24].forEach(z => {
    const l = new THREE.PointLight(0xffd29a, 1.7, 15, 2);
    l.position.set(s * (ROW_X - 1.4), 2.6, z); scene.add(l);
  }));
  /* the arch, and the building at the end of the street */
  const archL = new THREE.PointLight(0xffb45a, 2.6, 14, 2);
  archL.position.set(0, 6.4, ARCH_Z + 1.6); scene.add(archL); WORLD.archLight = archL;
  const endL = new THREE.PointLight(0xffc66a, 3.2, 18, 2);
  endL.position.set(0, 4.2, END_Z + 5.5); scene.add(endL); WORLD.endLight = endL;
}
/* ================================================== 7 · post-processing */
const POST = { levels: [] };
const QUAD_VS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

function initPost() {
  POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  POST.quad.frustumCulled = false;
  POST.qScene = new THREE.Scene(); POST.qScene.add(POST.quad);
  POST.up = new THREE.ShaderMaterial({
    uniforms: { tS: { value: null }, uAmt: { value: 1 } }, vertexShader: QUAD_VS,
    fragmentShader: 'uniform sampler2D tS; uniform float uAmt; varying vec2 vUv;\nvoid main(){ gl_FragColor = vec4(texture2D(tS,vUv).rgb*uAmt, 1.0); }',
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false
  });
  if (!WANT_POST) return;
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const O = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
  POST.scene = new THREE.WebGLRenderTarget(w, h, Object.assign({}, O, { depthBuffer: true, samples: LOW ? 0 : 2 }));
  let lw = Math.max(2, w >> 1), lh = Math.max(2, h >> 1);
  const N = 4;
  for (let i = 0; i < N; i++) {
    POST.levels.push({ a: new THREE.WebGLRenderTarget(lw, lh, O), b: new THREE.WebGLRenderTarget(lw, lh, O), w: lw, h: lh });
    lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
  }
  POST.bright = new THREE.ShaderMaterial({
    uniforms: { tS: { value: null }, uThr: { value: .86 }, uKnee: { value: .50 } },
    vertexShader: QUAD_VS,
    fragmentShader:
      'uniform sampler2D tS; uniform float uThr; uniform float uKnee; varying vec2 vUv;\n' +
      'void main(){ vec3 c = texture2D(tS, vUv).rgb;\n' +
      ' float l = dot(c, vec3(0.2126,0.7152,0.0722));\n' +
      ' float k = smoothstep(uThr, uThr+uKnee, l);\n' +
      ' gl_FragColor = vec4(c*k, 1.0); }'
  });
  POST.blur = new THREE.ShaderMaterial({
    uniforms: { tS: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
    vertexShader: QUAD_VS,
    fragmentShader:
      'uniform sampler2D tS; uniform vec2 uDir; varying vec2 vUv;\n' +
      'void main(){ vec3 c = texture2D(tS, vUv).rgb * 0.2270270270;\n' +
      ' c += texture2D(tS, vUv + uDir*1.3846153846).rgb * 0.3162162162;\n' +
      ' c += texture2D(tS, vUv - uDir*1.3846153846).rgb * 0.3162162162;\n' +
      ' c += texture2D(tS, vUv + uDir*3.2307692308).rgb * 0.0702702703;\n' +
      ' c += texture2D(tS, vUv - uDir*3.2307692308).rgb * 0.0702702703;\n' +
      ' gl_FragColor = vec4(c, 1.0); }'
  });
  POST.comp = new THREE.ShaderMaterial({
    uniforms: {
      tS: { value: null }, tB: { value: null }, uRes: { value: new THREE.Vector2(w, h) },
      uT: { value: 0 }, uBloom: { value: .34 }, uCA: { value: 1 }, uGrain: { value: .020 },
      uVig: { value: 1 }, uExp: { value: .62 }, uFade: { value: 1 }, uSat: { value: 1.05 }
    },
    vertexShader: QUAD_VS,
    fragmentShader:
      'uniform sampler2D tS; uniform sampler2D tB; uniform vec2 uRes;\n' +
      'uniform float uT, uBloom, uCA, uGrain, uVig, uExp, uFade, uSat;\n' +
      'varying vec2 vUv;\n' +
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }\n' +
      'void main(){\n' +
      ' vec2 d = vUv - 0.5; float r2 = dot(d,d);\n' +
      ' float ca = uCA * (0.30 + r2*2.6) * 0.0013;\n' +
      ' vec3 c;\n' +
      ' c.r = texture2D(tS, vUv + d*ca).r;\n' +
      ' c.g = texture2D(tS, vUv).g;\n' +
      ' c.b = texture2D(tS, vUv - d*ca).b;\n' +
      ' c += texture2D(tB, vUv).rgb * uBloom;\n' +
      ' c *= uExp;\n' +
      ' c = aces(c);\n' +
      ' float l = dot(c, vec3(0.2126,0.7152,0.0722));\n' +
      ' c = mix(vec3(l), c, uSat);\n' +
      ' c = mix(c, c*vec3(0.74,1.03,1.11), smoothstep(0.55,0.0,l)*0.80);\n' +    /* teal shadows */
      ' c = mix(c, c*vec3(1.035,0.995,0.968), smoothstep(0.50,1.0,l)*0.26);\n' + /* warm highs   */
      ' float v = smoothstep(1.22, 0.26, length(d*vec2(1.0,0.94))*1.42);\n' +
      ' c *= mix(1.0, v, uVig);\n' +
      ' float g = fract(sin(dot(vUv*uRes + uT*137.0, vec2(12.9898,78.233)))*43758.5453);\n' +
      ' c += (g-0.5)*uGrain;\n' +
      ' c *= uFade;\n' +
      ' vec3 e = pow(max(c,0.0), vec3(1.0/2.2));\n' +
      /* A touch of contrast, applied after the encode rather than before it:
         in linear the same curve mostly crushes the shadows, and this frame is
         nearly all shadow. Pivoted low, at 0.30, so it deepens the night
         without pulling the lit paper of the hall down with it. */
      ' e = clamp((e - 0.30) * 1.00 + 0.30, 0.0, 1.0);\n' +
      ' gl_FragColor = vec4( e, 1.0 );\n' +
      '}'
  });
}
function pass(mat, target, additive) {
  POST.quad.material = mat;
  renderer.setRenderTarget(target || null);
  if (!additive) renderer.clear(true, false, false);
  renderer.render(POST.qScene, POST.cam);
}
function renderPost() {
  const L = POST.levels;
  POST.bright.uniforms.tS.value = POST.scene.texture;
  pass(POST.bright, L[0].a);
  for (let i = 0; i < L.length; i++) {
    if (i > 0) { POST.up.blending = THREE.NoBlending; POST.up.uniforms.uAmt.value = 1; POST.up.uniforms.tS.value = L[i - 1].a; pass(POST.up, L[i].a); }
    POST.blur.uniforms.tS.value = L[i].a; POST.blur.uniforms.uDir.value.set(1 / L[i].w, 0); pass(POST.blur, L[i].b);
    POST.blur.uniforms.tS.value = L[i].b; POST.blur.uniforms.uDir.value.set(0, 1 / L[i].h); pass(POST.blur, L[i].a);
  }
  POST.up.blending = THREE.AdditiveBlending; POST.up.uniforms.uAmt.value = .52;
  for (let i = L.length - 1; i > 0; i--) { POST.up.uniforms.tS.value = L[i].a; pass(POST.up, L[i - 1].a, true); }
  POST.comp.uniforms.tS.value = POST.scene.texture;
  POST.comp.uniforms.tB.value = L[0].a;
  pass(POST.comp, null);
}

/* ================================================= 8 · the camera rig */
const CAM = [
  { p: [  0.0, 4.05,  13.6 ], t: [  0.0, 5.40, -18.0 ], fov: 38 },  /* 0 hero: down the street      */
  { p: [ -2.6, 2.10,   7.0 ], t: [  5.0, 4.20, -12.0 ], fov: 46 },  /* 1 the street: the right row  */
  { p: [  2.8, 2.60,  -1.0 ], t: [ -7.4, 3.40, -10.0 ], fov: 46 },  /* 2 demos: the demo shops     */
  { p: [  0.0, 1.70,  -3.0 ], t: [  0.0, 8.60, -13.0 ], fov: 54 },  /* 3 process: under the arch   */
  { p: [  2.2, 4.00, -22.0 ], t: [ -4.2, 5.00, -44.0 ], fov: 42 },  /* 4 contact: your board       */
  { p: [  0.0, 11.0, -23.0 ], t: [  0.0, 2.50, -44.0 ], fov: 48 }   /* 5 footer                    */
];
const RIG = { prog: 0, smooth: 0, mx: 0, my: 0, tmx: 0, tmy: 0, intro: 0, focus: -1, focusAmt: 0 };
let curveP, curveT, tmpCam;

function buildRig() {
  curveP = new THREE.CatmullRomCurve3(CAM.map(c => new THREE.Vector3(c.p[0], c.p[1], c.p[2])), false, 'catmullrom', .42);
  curveT = new THREE.CatmullRomCurve3(CAM.map(c => new THREE.Vector3(c.t[0], c.t[1], c.t[2])), false, 'catmullrom', .42);
  tmpCam = new THREE.PerspectiveCamera(CAM[0].fov, vpW() / vpH(), .35, 220);
  camera.layers.enable(1); camera.layers.enable(2);
}
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
/* Every waypoint is composed for a wide frame. On a tall one the same
   numbers crop the gate in half, so the rig steps back along its own view
   axis and opens up a little instead of letting the sides fall away. */
function aspectFix() { return clamp((1.62 - vpW() / vpH()) / 1.05, 0, 1); }
function fitAspect(p, t, fov) {
  const nf = aspectFix();
  if (nf <= 0) return fov;
  _d.subVectors(p, t).normalize();
  p.addScaledVector(_d, nf * 8.2);
  p.y += nf * 1.1;
  return fov * (1 + nf * .40);
}
function applyCamera() {
  const N = CAM.length - 1;
  const u = clamp(RIG.smooth / N, 0, 1);
  curveP.getPoint(u, _p); curveT.getPoint(u, _t);
  const i = clamp(Math.floor(RIG.smooth), 0, N - 1), f = clamp(RIG.smooth - i, 0, 1);
  let fov = lerp(CAM[i].fov, CAM[i + 1].fov, f);

  fov = fitAspect(_p, _t, fov);

  /* the opening dolly: a long lens easing in from further back */
  const io = 1 - RIG.intro;
  _p.z += io * 5.6; _p.y += io * 0.65; fov += io * 8;

  /* parallax — a hand-held drift, never enough to break the frame */
  const par = 1 - smooth(0, 1.6, RIG.smooth) * .55;
  _p.x += RIG.mx * 0.62 * par; _p.y += RIG.my * 0.34 * par;
  _t.x -= RIG.mx * 0.20 * par; _t.y -= RIG.my * 0.12 * par;

  camera.position.copy(_p);
  camera.lookAt(_t);
  if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

/* ============================================== 9 · scroll ↔ chapters */
const SECS = [].slice.call(document.querySelectorAll('[data-cam]'));
let anchors = [], maxScroll = 1, activeSec = 0;
function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vpH());
  anchors = SECS.map((el, i) => {
    if (i === 0) return 0;
    if (i === SECS.length - 1) return maxScroll;
    return clamp(el.offsetTop + el.offsetHeight * .5 - vpH() * .5, 0, maxScroll);
  });
  for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
}
function progressFor(y) {
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++)
    if (y <= anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  return anchors.length - 1;
}

/* ============================================ 10 · the wordmark layout */
function layoutWord() {
  if (!WORD.group) return;
  const c = CAM[0];
  const hp = new THREE.Vector3(c.p[0], c.p[1], c.p[2]);
  const ht = new THREE.Vector3(c.t[0], c.t[1], c.t[2]);
  tmpCam.fov = fitAspect(hp, ht, c.fov);
  tmpCam.aspect = vpW() / vpH();
  tmpCam.position.copy(hp);
  tmpCam.lookAt(ht);
  tmpCam.updateProjectionMatrix(); tmpCam.updateMatrixWorld(true);
  const hit = (nx, ny) => {
    const v = new THREE.Vector3(nx, ny, .5).unproject(tmpCam).sub(tmpCam.position).normalize();
    return tmpCam.position.clone().addScaledVector(v, (WORD_Z - tmpCam.position.z) / v.z);
  };
  const L = hit(-1, 0), R = hit(1, 0);
  /* Judge the frame by its shape, not its width. What forces the word up and
     in is a *tall* frame, and a 768-wide tablet held upright is as tall as a
     phone — on a width test it took the desktop baseline and sat below the
     fold with only the top of the G showing. */
  const narrow = vpW() / vpH() < 1.05;
  /* Four wide-tracked letters reach the frame edge exactly; pushing past it,
     as the six-letter word could afford to, decapitates the K and the E. The
     narrow branch is held a little inside the edge because a phone frame has
     no gutter to lose the tracking that trails the final letter into. */
  const fill = narrow ? .92 : .94;
  const s = (R.x - L.x) * fill / WORD.ink.w;
  /* on a tall frame the mounds sit near mid-height, so the baseline has to
     ride above them or the whole word disappears into the grass */
  const base = hit(0, narrow ? -.16 : -.585);
  WORD.group.scale.setScalar(s);
  WORD.group.position.set(-WORD.ink.cx * s, base.y, WORD_Z);
  WORD.rise = WORD.ink.asc * s * 1.25;
}

/* =================================================== 11 · page wiring */
const $  = s => document.querySelector(s);
const $$ = s => [].slice.call(document.querySelectorAll(s));
const nav = $('#nav'), preEl = $('#pre'), preFill = $('#pre-fill'), prePct = $('#pre-pct');

function wireReveals() {
  splitHeadingWords();
  const groups = new Map();
  const items = $$('[data-rv], .mask-line');
  items.forEach(el => {
    const key = el.parentElement;
    const arr = groups.get(key) || []; arr.push(el); groups.set(key, arr);
  });
  groups.forEach(arr => arr.forEach((el, i) => el.dataset.rvd = i * 85));
  const io = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const d = parseFloat(e.target.dataset.rvd || 0);
      setTimeout(() => e.target.classList.add('rv-in'), REDUCE ? 0 : d);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: .04 });
  items.forEach(el => { if (!el.closest('#hero')) io.observe(el); });
}

/* Word-level masks let every display heading arrive at a human reading pace.
   The original text remains the accessible label, while the visual words are
   explicitly presentational. The existing section observer still controls
   when each heading starts. */
function splitHeadingWords() {
  if (REDUCE) return;
  $$('h1.display, h2.display').forEach(heading => {
    /* the heading keeps its whole sentence as its name; the split words are
       presentation only */
    heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
    const lines = heading.querySelectorAll('.mask-line');
    const targets = lines.length ? [].slice.call(lines) : [heading];
    targets.forEach(target => {
      if (target.dataset.wordReady === 'true') return;
      const phrase = target.textContent.replace(/\s+/g, ' ').trim();
      if (!phrase) return;
      target.dataset.wordReady = 'true';
      target.classList.add('word-reveal');
      target.textContent = '';
      phrase.split(' ').forEach((word, i) => {
        if (i) target.appendChild(document.createTextNode(' '));
        const mask = document.createElement('span');
        const inner = document.createElement('span');
        mask.className = 'word-mask'; mask.setAttribute('aria-hidden', 'true');
        inner.className = 'word'; inner.textContent = word;
        inner.style.setProperty('--word-delay', (i * 72) + 'ms');
        mask.appendChild(inner); target.appendChild(mask);
      });
    });
  });
}

/* Foreground PNGs are section-owned until their chapter is called. At that
   point the active stage becomes a fixed lower viewport plane; its predecessor
   remains there just long enough to blur and fade out before returning home.

   While it holds that plane the stage is re-parented into #fg-sky, which lives
   outside .page and so is not capped by its stacking context — that is the
   only way a cut-out can pass in front of the nav and the chapter rail. The
   move costs nothing in layout: the stage is position:fixed either way, and
   its placement rules key off [data-fg], not off the section it came from. */
function wireForegroundStages() {
  const pairs = $$('.sec .fg, .foot .fg').map(stage => ({
    section:stage.closest('.sec, .foot'), stage
  })).filter(pair => pair.section);
  if (!pairs.length) return;

  const sky = $('#fg-sky');
  const ratios = new Map(pairs.map(pair => [pair.section, 0]));
  const homes = new WeakMap(pairs.map(pair => [pair.stage, pair.section]));
  const timers = new WeakMap();
  let activeStage = null;

  const lift = stage => {
    if (!sky || stage.parentNode === sky) return;
    sky.appendChild(stage);
    /* A re-inserted element has no previous computed style, so the entrance
       would land already finished. Resolve the parked state in its new parent
       first and the pieces have something to rise from. */
    void stage.offsetWidth;
  };
  const park = stage => {
    const home = homes.get(stage);
    if (home && stage.parentNode !== home) home.insertBefore(stage, home.firstChild);
  };

  const retire = stage => {
    if (!stage || stage === activeStage) return;
    const pending = timers.get(stage);
    if (pending) clearTimeout(pending);
    stage.classList.remove('fg-active');
    if (REDUCE) { park(stage); return; }
    stage.classList.add('fg-retiring');
    timers.set(stage, setTimeout(() => {
      stage.classList.remove('fg-retiring');
      timers.delete(stage);
      park(stage);
    }, 820));
  };

  const activate = stage => {
    if (!stage || stage === activeStage) return;
    const pending = timers.get(stage);
    if (pending) clearTimeout(pending);
    stage.classList.remove('fg-retiring');
    lift(stage);
    stage.classList.add('fg-active');
    const prior = activeStage;
    activeStage = stage;
    retire(prior);
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
    const next = pairs.reduce((best, pair) =>
      (ratios.get(pair.section) || 0) > (ratios.get(best.section) || 0) ? pair : best
    );
    const nextRatio = ratios.get(next.section) || 0;
    if (nextRatio > 0) activate(next.stage);
    else if (activeStage) {
      const prior = activeStage;
      activeStage = null;
      retire(prior);
    }
  }, { rootMargin:'-12% 0px -12% 0px', threshold:[0, .12, .32, .55] });

  pairs.forEach(pair => observer.observe(pair.section));
}

/* ------------------------------------------------------ leaving the hero
   Everything along the foot of the hero is spent the moment the walk starts:
   the cue has been read, the four chapters have been offered, the preview has
   been seen, and the scrim under them is only there to hold the type off the
   sanctuary. Letting the block slide away together reads as the page moving;
   giving each piece its own window empties the foot one element at a time
   instead, which reads as the hero standing down.

   The preview window is not staggered with the rest. It is the largest,
   flattest thing in the frame and a slow fade just dims it in place, so it
   goes early, goes quickly, and dissolves rather than fades: the blur is what
   makes the frame look like it is letting go of it rather than turning it
   down.

   Nothing is written until the scroll actually leaves zero, and everything is
   handed back the moment it returns: these elements carry the page's own
   entrance reveal, and an inline opacity set at rest would pre-empt it. */
function wireHeroExit() {
  const hero = $('#hero'); if (!hero) return;
  /* at = where in the exit it starts, span = how long it takes to go */
  const seq = [
    { el: $('.peek'),      at: .00, span: .26, blur: 10 },
    { el: $('.hero-cue'),  at: .10, span: .30, shift: true },
    ...$$('.chip').map((el, i) => ({ el: el, at: .20 + i * .10, span: .30, shift: true })),
    { el: $('.chapters'),  at: .60, span: .30 },  /* shifting it carries the chips twice */
    { el: $('.hero-side'), at: .70, span: .30 }   /* its transform is the centring -50% */
  ].filter(o => o.el);
  let on = false;
  const apply = () => {
    const t = clamp(scrollY / Math.max(1, vpH() * .58), 0, 1);
    if (t <= 0) {
      if (!on) return;
      seq.forEach(o => {
        o.el.style.opacity = ''; o.el.style.transform = ''; o.el.style.filter = '';
        o.el.style.pointerEvents = ''; o.el.style.transition = '';
      });
      on = false; return;
    }
    on = true;
    seq.forEach(o => {
      /* these carry the reveal's own .9s opacity transition, which would
         animate every value written here — the fade would then trail the
         scroll by most of a second and stop reading as scroll-driven */
      o.el.style.transition = 'none';
      const a = 1 - smooth(o.at, o.at + o.span, t);
      o.el.style.opacity = a.toFixed(3);
      if (o.shift) o.el.style.transform = 'translate3d(0,' + ((1 - a) * 15).toFixed(1) + 'px,0)';
      if (o.blur) o.el.style.filter = a > .999 ? '' : 'blur(' + ((1 - a) * o.blur).toFixed(1) + 'px)';
      o.el.style.pointerEvents = a < .05 ? 'none' : '';
    });
  };
  addEventListener('scroll', apply, { passive: true });
  addEventListener('resize', apply, { passive: true });
  apply();
}

function wireNav() {
  let last = 0;
  const rail = $('#rail');
  const names = ['Top', 'The street', 'Try a shop', 'How it works', 'Your shop', 'Footer'];
  SECS.forEach((s, i) => {
    const b = document.createElement('button');
    b.innerHTML = '<i></i>'; b.title = names[i] || ''; b.tabIndex = -1;
    b.setAttribute('aria-label', names[i] || 'section');
    b.addEventListener('click', () => scrollTo({ top: anchors[i], behavior: REDUCE ? 'auto' : 'smooth' }));
    rail.appendChild(b);
  });
  const dots = $$('#rail button');
  const links = $$('.nav-link');
  const burger = $('.nav-burger');
  const closeMenu = () => {
    nav.classList.remove('menu-open');
    burger.classList.remove('active');
    burger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('nav-open');
  };
  const setMenu = open => {
    /* clear the scroll-hide before the sheet opens: leaving it set would ease
       the bar back down on close, promoting it again under the outgoing sheet */
    if (open) nav.classList.remove('hide');
    nav.classList.toggle('menu-open', open);
    burger.classList.toggle('active', open);
    burger.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('nav-open', open);
  };
  burger.setAttribute('aria-controls', 'navlinks');
  burger.setAttribute('aria-expanded', 'false');
  burger.addEventListener('click', () => {
    if (vpW() > 820) return;
    setMenu(!nav.classList.contains('menu-open'));
  });
  links.forEach(link => link.addEventListener('click', closeMenu));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  addEventListener('resize', () => { if (vpW() > 820) closeMenu(); }, { passive:true });
  /* Which chapter each link actually points at, read off its href. The old
     rule was positional — link i lit for section i+1 — which silently assumed
     one link per section in matching order. With five links over four chapters
     every entry past the third lit for its neighbour: standing in Afterlight
     highlighted Stories. Reading the destination cannot drift. */
  const linkSec = links.map(l => SECS.indexOf(document.querySelector(l.getAttribute('href'))));
  window.addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('stuck', y > 40);
    /* and don't even mark it hidden while the menu is open, or the class lands
       the moment the sheet closes and the bar blinks away under the thumb */
    nav.classList.toggle('hide',
      !nav.classList.contains('menu-open') && y > last + 4 && y > vpH() * .8);
    last = y;
    const a = Math.round(progressFor(y));
    if (a !== activeSec) {
      activeSec = a;
      dots.forEach((d, i) => d.classList.toggle('on', i === a));
      links.forEach((l, i) => l.classList.toggle('on', linkSec[i] === a));
    }
  }, { passive: true });
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    scrollTo({ top: a.getAttribute('href') === '#top' ? 0 : t.offsetTop - 40, behavior: REDUCE ? 'auto' : 'smooth' });
  }));
}

function wireFocus() {
  const set = i => { RIG.focus = i; };
  $$('[data-chip]').forEach(el => {
    el.addEventListener('mouseenter', () => { set(+el.dataset.chip); $$('[data-chip]').forEach(o => o.classList.toggle('on', o === el)); });
    el.addEventListener('mouseleave', () => { set(-1); el.classList.remove('on'); });
  });
  $$('[data-les]').forEach(el => {
    el.addEventListener('mouseenter', () => set(+el.dataset.les % 4));
    el.addEventListener('mouseleave', () => set(-1));
  });
}

function wireCursor() {
  const dot = $('#cursor');
  if (COARSE) { dot.style.display = 'none'; return; }
  let x = vpW() / 2, y = vpH() / 2, tx2 = x, ty = y;
  addEventListener('pointermove', e => {
    tx2 = e.clientX; ty = e.clientY;
    RIG.tmx = (e.clientX / vpW()) * 2 - 1;
    RIG.tmy = -((e.clientY / vpH()) * 2 - 1);
  }, { passive: true });
  $$('[data-cursor]').forEach(el => {
    el.addEventListener('mouseenter', () => dot.classList.add('act'));
    el.addEventListener('mouseleave', () => dot.classList.remove('act'));
  });
  (function tick() {
    x = lerp(x, tx2, .18); y = lerp(y, ty, .18);
    dot.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    requestAnimationFrame(tick);
  })();
}

function makeGrain() {
  const S = 180, c = cvs(S, S), x = c.getContext('2d');
  const im = x.createImageData(S, S), d = im.data, r = mulberry32(9);
  for (let i = 0; i < S * S; i++) {
    const v = 110 + r() * 90;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  $('#grain').style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
}

/* ============================================ 12 · the card viewports */
const CARDS = [];
function buildCards() {
  /* the three demo shops, each seen square-on from across the road, and the
     board at the end of the street for the window in the hero */
  const defs = [0, 1, 2].map(i => {
    const s = shopSpot(i);
    return { p: [1.2, 2.5, s.z + 1.8], t: [s.x, 3.1, s.z - .2], fov: 46 };
  });
  defs.push({ p: [0, 4.6, -27.0], t: [0, 5.2, END_Z], fov: 30 });
  $$('[data-view]').forEach(el => {
    const d = defs[+el.dataset.view]; if (!d) return;
    const c = new THREE.PerspectiveCamera(d.fov, 4 / 5, .3, 200);
    c.position.set(d.p[0], d.p[1], d.p[2]);
    c.lookAt(d.t[0], d.t[1], d.t[2]);
    c.layers.set(0);
    c.userData = { home: c.position.clone(), look: new THREE.Vector3(d.t[0], d.t[1], d.t[2]), push: 0, want: 0 };
    CARDS.push({ cam: c, el: el.querySelector('[data-frame]') || el, rect: null });
    el.addEventListener('mouseenter', () => c.userData.want = 1);
    el.addEventListener('mouseleave', () => c.userData.want = 0);
  });
}
/* A render target keeps its own viewport/scissor — renderer.setScissor()
   only ever reaches the default framebuffer, so the region has to be set on
   whichever surface we are actually drawing into, and re-bound to take. */
const _push = new THREE.Vector3();
function setRegion(rt, x, y, w, h) {
  if (rt) {
    const pr = renderer.getPixelRatio();
    rt.viewport.set(x * pr, y * pr, w * pr, h * pr);
    rt.scissor.set(x * pr, y * pr, w * pr, h * pr);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
  } else {
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.setScissorTest(true);
  }
}
function clearRegion(rt) {
  if (rt) {
    rt.viewport.set(0, 0, rt.width, rt.height);
    rt.scissor.set(0, 0, rt.width, rt.height);
    rt.scissorTest = false;
    renderer.setRenderTarget(rt);
  } else {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, vpW(), vpH());
    renderer.setScissor(0, 0, vpW(), vpH());
  }
}
function cardBuffer(C, w, h) {
  const pr = Math.min(renderer.getPixelRatio(), 2);
  const W = Math.max(8, Math.round(w * pr)), H = Math.max(8, Math.round(h * pr));
  if (C.rt && C.rt.width === W && C.rt.height === H) return C.rt;
  if (C.rt) C.rt.dispose();
  C.rt = new THREE.WebGLRenderTarget(W, H, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false
  });
  C.dirty = true;
  return C.rt;
}
function aimCard(C, aspect) {
  const c = C.cam, u = c.userData;
  c.aspect = aspect; c.updateProjectionMatrix();
  _push.subVectors(u.look, u.home).normalize();
  c.position.copy(u.home).addScaledVector(_push, u.push * .55);
  c.lookAt(u.look);
}
/* Each viewport keeps its own buffer and only re-renders when it is moving
   or when its slot in the refresh rota comes round — the views are static,
   so paying for four scene traversals every frame buys nothing. */
/* The blit lands in the composite at the element's screen rect, and the canvas
   knows nothing about the DOM stacked over it — so a card the page has faded
   goes on painting a live view into the frame with no card around it, which is
   what put a second lit hall in the corner once the hero exit started dimming
   the preview. Cull on the element's effective opacity, not just its rect.

   Below full opacity is the right place to stop: the card's own still is
   opaque, so the view behind it only ever shows through by (1 − alpha). At
   alpha just under one that is nothing, and the cut is invisible. */
function cardAlpha(el) {
  let a = 1;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden') return 0;
    a *= +s.opacity;
    if (a < .001) return 0;
  }
  return a;
}
function renderCards(rt) {
  if (!CARDS.length) return;
  let drew = false;
  for (let i = 0; i < CARDS.length; i++) {
    const C = CARDS[i], r = C.el.getBoundingClientRect();
    if (r.bottom < -40 || r.top > vpH() + 40 || r.width < 4) continue;
    if (cardAlpha(C.el) < .995) continue;
    /* a card carrying cloth has no background left of its own, so the blit
       would show through the fabric's rounded corners and past its edges */
    if (C.el.classList.contains('on-cloth')) continue;
    if (!WANT_POST) {                              /* debug path: straight in */
      setRegion(rt, r.left, vpH() - r.bottom, r.width, r.height);
      renderer.clear(true, true, false);
      aimCard(C, r.width / r.height);
      renderer.render(scene, C.cam);
      drew = true; continue;
    }
    const buf = cardBuffer(C, r.width, r.height);
    const u = C.cam.userData;
    if (C.dirty || Math.abs(u.push - u.want) > .002 || (FRAME + i * 7) % 24 === 0) {
      aimCard(C, r.width / r.height);
      renderer.setRenderTarget(buf);
      renderer.clear(true, true, false);
      renderer.render(scene, C.cam);
      C.dirty = false;
    }
    setRegion(rt, r.left, vpH() - r.bottom, r.width, r.height);
    POST.up.blending = THREE.NoBlending;
    POST.up.uniforms.uAmt.value = 1;
    POST.up.uniforms.tS.value = buf.texture;
    pass(POST.up, rt);
    drew = true;
  }
  if (drew) clearRegion(rt);
}

/* ==================================================== 13 · the machine */
let running = false, tPrev = 0, clock = 0, fadeIn = 0;
const INTRO = { t0: 0 };

function resize() {
  const w = vpW(), h = vpH();
  document.documentElement.style.setProperty('--vw', w + 'px');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP) * PERF.scale);
  renderer.setSize(w, h, true);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const pw = renderer.domElement.width, ph = renderer.domElement.height;
  if (WANT_POST && POST.scene) {
    POST.scene.setSize(pw, ph);
    POST.comp.uniforms.uRes.value.set(pw, ph);
    let lw = Math.max(2, pw >> 1), lh = Math.max(2, ph >> 1);
    POST.levels.forEach(L => { L.a.setSize(lw, lh); L.b.setSize(lw, lh); L.w = lw; L.h = lh; lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1); });
  }
  /* multisampling is the first thing to go when the budget tightens */
  if (POST.scene) {
    const want = (!LOW && PERF.scale > .78) ? 2 : 0;
    if (POST.scene.samples !== want) { POST.scene.samples = want; POST.scene.dispose(); }
  }
  CARDS.forEach(C => { C.dirty = true; });
  if (WANT_SHADOW && WORLD.key) WORLD.key.shadow.needsUpdate = true;
  if (WORLD.embers) WORLD.embers.material.uniforms.uSize.value = h * renderer.getPixelRatio() * .5;
  if (WISP.mesh) WISP.mesh.material.uniforms.uPx.value = h * renderer.getPixelRatio();
  placeMoon();
  layoutWord();
  measure();
}

function updateWorld(dt) {
  WORLD.uT.value = clock;

  /* the focused chapter warms the lanterns and swells the disc */
  RIG.focusAmt = damp(RIG.focusAmt, RIG.focus >= 0 ? 1 : 0, 5, dt);
  const pulse = Math.sin(clock * 1.9) * .5 + .5;
  const f = RIG.focusAmt;
  if (WORLD.endGlow) WORLD.endGlow.material.opacity = .22 + f * .10 + Math.sin(clock * .6) * .03;
  if (WORLD.endLight) WORLD.endLight.intensity = 3.2 * (1 + f * .25);
  /* the moon only breathes — the haze in front of it is what actually moves */
  if (WORLD.moonHalo) WORLD.moonHalo.material.opacity = .44 + f * .10 + Math.sin(clock * .34) * .05;
  if (WORLD.lampGlows) WORLD.lampGlows.forEach(g => { g.quaternion.copy(camera.quaternion); });
  /* a few boards have a tube on its way out */
  if (WORLD.boards && !REDUCE) WORLD.boards.forEach(b => {
    if (!b.flicker) return;
    const off = Math.sin(clock * 21 + b.ph) > .93 && Math.sin(clock * .8 + b.ph) > .4;
    b.mat.color.setScalar(b.base * (off ? .42 : 1));
  });
  updateBulbs(dt);

  /* haze slides across the courtyard */
  if (WORLD.haze) WORLD.haze.forEach(h => {
    h.position.x = h.userData.x0 + Math.sin(clock * h.userData.sp + h.userData.ph) * 5.5;
    h.quaternion.copy(camera.quaternion);
  });

  /* ripples on the standing water */
  if (WORLD.ripples) WORLD.ripples.forEach(r => {
    const u = r.userData;
    u.t += dt * u.sp;
    if (u.t > 4) { u.t = 0; u.x = (Math.random() - .5) * 22; u.z = -8 + Math.random() * 22; }
    const k = u.t / 4;
    const s = .3 + k * 4.2;
    r.scale.set(s, s, 1);
    r.position.set(u.x, .02, u.z);
    r.material.opacity = Math.sin(k * Math.PI) * .16;
  });

  /* the type rises from behind the grass, then dissolves as you close on it */
  if (WORD.group) {
    const near = smooth(0.02, 0.92, RIG.smooth);
    WORD.glyphs.forEach((g, i) => {
      const st = clamp((WORD.reveal - i * .075) / .62, 0, 1);
      const e = easeOut(st);
      g.position.y = g.userData.baseY - (1 - e) * (WORD.ink.asc * 1.15);
      g.material.opacity = e * (1 - near * .96);
      g.visible = g.material.opacity > .004;
    });
  }
  /* the cut-out layers dissolve as the camera reaches them, so the path can
     walk straight through the garden instead of steering around the veil */
  if (WORLD.fg) WORLD.fg.forEach(m => {
    const a = smooth(.9, 4.6, camera.position.z - m.position.z);
    m.material.opacity = a;
    m.visible = a > .006;
  });
  updateLeaves(dt);
  updateWisps(dt);
  if (CARDS.length) CARDS.forEach(C => { const u = C.cam.userData; u.push = damp(u.push, u.want, 3.4, dt); });
}

let FRAME = 0;
function render() {
  FRAME++;
  renderer.setRenderTarget(WANT_POST ? POST.scene : null);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);
  renderCards(WANT_POST ? POST.scene : null);
  renderer.setRenderTarget(null);
  if (WANT_POST) {
    POST.comp.uniforms.uT.value = clock;
    POST.comp.uniforms.uFade.value = fadeIn;
    renderPost();
  }
}

function frame(now) {
  if (!running) return;
  const raw = (now - tPrev) / 1000 || 0;
  const dt = Math.min(raw, .05);              /* animation never jumps … */
  tPrev = now; if (!REDUCE) clock += dt;
  fadeIn = INTRO.t0 ? sat((now - INTRO.t0) / 700) : 1;

  if (!PERF.locked && clock > 2.2) {
    PERF.acc += raw; PERF.n++;      /* … but the governor reads the truth */
    if (PERF.n >= 40 || PERF.acc > .9) {
      const avg = PERF.acc / PERF.n; PERF.acc = 0; PERF.n = 0;
      if (avg > .0230 && PERF.scale > .55) { PERF.scale = Math.max(.55, PERF.scale * (avg > .05 ? .64 : .85)); resize(); }
      else if (avg < .0138 && PERF.scale < 1) { PERF.scale = Math.min(1, PERF.scale + .08); resize(); }
    }
  }
  RIG.prog = progressFor(scrollY);
  RIG.smooth = REDUCE ? RIG.prog : damp(RIG.smooth, RIG.prog, 5.2, dt);
  RIG.mx = damp(RIG.mx, RIG.tmx, 2.6, dt);
  RIG.my = damp(RIG.my, RIG.tmy, 2.6, dt);
  if (INTRO.t0) {
    const el = (now - INTRO.t0) / 1000;
    RIG.intro = sat(el / 2.4);
    WORD.reveal = Math.min(1.2, el / 1.5);
  }

  applyCamera();
  updateWorld(REDUCE ? 0 : dt);
  render();
  queue();
}
const TIMER = qs('driver', 'raf') === 'timer';
function queue() { TIMER ? setTimeout(() => frame(performance.now()), 16) : requestAnimationFrame(frame); }

/* ======================================================== 14 · booting */
const JOBS = [
  ['Reading the type', () => document.fonts && Promise.all([
    document.fonts.load('900 320px Wordmark'),
    document.fonts.load('600 80px Kannada', 'ಕನ್ನಡ'),
    document.fonts.load('700 40px Onest')])],
  ['Laying the road', () => { initGL(); WORLD.uT = { value: 0 }; buildRig(); buildLights(); buildShell(); }],
  ['Raising the shops', () => buildShops()],
  ['Hanging the moon', () => buildMoon()],
  ['Tying up the arch', () => { buildArch(); buildStreetLights(); finishBulbs(); }],
  ['Lighting the lamps', () => {
    [[-1, 1.5], [1, -6], [-1, -17.5], [1, -21], [-1, -31], [1, -35.5]]
      .forEach((l, i) => buildLamp(l[0], l[1], !LOW || i % 2 === 0));
  }],
  ['Parking the autos', () => {
    buildAuto(-4.1, -12.4, Math.PI * .97); buildAuto(4.0, -26.5, .05); buildAuto(-3.9, -30.0, Math.PI);
  }],
  ['Growing the gulmohars', () => {
    buildMaple(71, -6.5, 5.0, 1.7); buildMaple(73, -6.6, -38.5, 1.5); buildMaple(75, 6.6, 7.0, 1.35);
  }],
  ['Painting the near grass', () => buildForeground()],
  ['Cutting the name', () => buildWordmark()],
  ['Bringing the drizzle', () => { buildAtmosphere(); buildLeafFall(); buildWisps(); }],
  ['Switching on the street', () => {
    initPost(); buildCards();
    WORLD.fg.forEach(m => m.layers.set(1));
    WORD.glyphs.forEach(m => m.layers.set(2));
    if (WORLD.rain) WORLD.rain.layers.set(1);
    /* the fall is all around the rig, including behind it */
    if (WORLD.leaves) WORLD.leaves.mesh.layers.set(1);
    WORLD.ripples.forEach(r => r.layers.set(1));
    layoutWord(); measure();
    /* nothing that casts a shadow ever moves, so bake it once */
    if (WANT_SHADOW && WORLD.key) { WORLD.key.shadow.autoUpdate = false; WORLD.key.shadow.needsUpdate = true; }
    wireShopName();
  }]
];

/* the contact form's shop name goes up on the board at the end of the street */
function wireShopName() {
  const input = $('#shop-name'); if (!input) return;
  let t = 0;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => drawEndBoard(input.value.slice(0, 40)), 120);
  });
  if (input.value) drawEndBoard(input.value.slice(0, 40));
}

function boot() {
  makeGrain();
  wireReveals(); wireForegroundStages(); wireNav(); wireHeroExit(); wireFocus(); wireCursor();
  document.body.classList.add('is-locked');
  let i = 0;
  const step = () => {
    const j = JOBS[i];
    const done = () => {
      i++;
      const p = i / JOBS.length;
      preFill.style.right = ((1 - p) * 100).toFixed(1) + '%';
      prePct.textContent = Math.round(p * 100);
      if (i < JOBS.length) setTimeout(step, 16); else setTimeout(start, 220);
    };
    let r;
    try { r = j[1](); }
    catch (err) {
      console.error('[street] job "' + j[0] + '" failed', err);
      if (i <= 1) return fallback(err);          /* no renderer, no scene */
    }
    (r && r.then) ? r.then(done, done) : done();
  };
  setTimeout(step, 60);
}

function fallback(err) {
  document.documentElement.classList.add('no-webgl');
  document.body.classList.add('no-webgl');
  document.body.classList.remove('is-locked');
  preEl.classList.add('done');
  $$('[data-rv], .mask-line').forEach(e => e.classList.add('rv-in'));
  window.__street = { fallback: true, error: String(err && err.message || err) };
}

function start() {
  addEventListener('resize', () => { resize(); }, { passive: true });
  addEventListener('orientationchange', () => setTimeout(resize, 250));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; tPrev = performance.now(); queue(); }
  });
  resize();

  const shot = Q.get('shot');
  if (shot !== null) {                       /* deterministic states for review */
    RIG.intro = 1; WORD.reveal = 1.2; fadeIn = 1; INTRO.t0 = 0;
    const n = clamp(parseInt(shot, 10) || 0, 0, SECS.length - 1);
    scrollTo(0, anchors[n]);
    RIG.smooth = RIG.prog = progressFor(anchors[n]);
    $$('[data-rv], .mask-line').forEach(e => e.classList.add('rv-in'));
    document.body.classList.remove('is-locked');
    preEl.classList.add('done');
  } else {
    preEl.classList.add('done');
    setTimeout(() => {
      document.body.classList.remove('is-locked');
      $('#hero').querySelectorAll('[data-rv], .mask-line').forEach((e, i) =>
        setTimeout(() => e.classList.add('rv-in'), REDUCE ? 0 : 120 + i * 95));
    }, REDUCE ? 0 : 340);
  }
  running = true; tPrev = performance.now();
  INTRO.t0 = shot !== null ? 0 : (REDUCE ? performance.now() - 4000 : performance.now());
  queue();
  window.__street = { RIG: RIG, WORLD: WORLD, WORD: WORD, CAM: CAM, POST: POST, renderer: renderer, scene: scene, camera: camera, anchors: () => anchors };
}

if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
else addEventListener('DOMContentLoaded', boot);
})();
