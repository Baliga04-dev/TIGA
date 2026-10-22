// The street (crossfade + rain on capable devices), the live phone demos, the contact signboard, entrances.
import { createCondensation } from './vendor/condensation.js';

document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- WhatsApp links, with the shop's name in the message when the visitor typed one ----------------------
const number = ((window.SITE && window.SITE.whatsapp) || '').replace(/\D/g, '');
const shopInput = document.getElementById('shop-name');
const board = document.querySelector('[data-board]');
const message = () => {
  const shop = shopInput && shopInput.value.trim();
  return shop ? `Hi Adithya, I’d like a website for ${shop}.` : 'Hi Adithya, I’d like to talk about a website for my shop.';
};
const updateLinks = () => {
  if (!number) return;
  document.querySelectorAll('[data-whatsapp]').forEach((a) => { a.href = `https://wa.me/${number}?text=${encodeURIComponent(message())}`; });
};
updateLinks();
shopInput?.addEventListener('input', () => {
  board.textContent = shopInput.value.trim() || 'Your shop';
  updateLinks();
});

// --- The street: slow crossfade between two views, rain on the glass where the device can afford it --------
const pics = [...document.querySelectorAll('.street-pic')];
if (!reduced && pics.length > 1) {
  let on = 0, timer = 0;
  const next = () => { pics[on].classList.remove('is-on'); on = (on + 1) % pics.length; pics[on].classList.add('is-on'); };
  const start = () => { if (!timer) timer = setInterval(next, 6500); };
  const stop = () => { clearInterval(timer); timer = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
}

const capable = !reduced && !(navigator.connection && navigator.connection.saveData)
  && (navigator.deviceMemory === undefined || navigator.deviceMemory >= 4)
  && (navigator.hardwareConcurrency || 4) >= 4;
const canvas = document.querySelector('.rain');
if (capable && canvas) {
  const host = canvas.parentElement;
  const rain = createCondensation(canvas, { speed: 1, dropAmount: matchMedia('(max-width: 860px)').matches ? 0.6 : 1 });
  if (rain) {
    canvas.hidden = false;
    let frame = 0, visible = true;
    const size = () => { const b = host.getBoundingClientRect(); rain.resize(b.width, b.height); };
    const tick = (now) => { rain.render(now); frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0; };
    new ResizeObserver(size).observe(host);
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(tick);
    }).observe(host);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !frame) frame = requestAnimationFrame(tick); });
    size();
    frame = requestAnimationFrame(tick);
  }
}

// --- Demo shop tabs (arrow keys move between them, as a tablist should) --------------------------------------
const tabs = [...document.querySelectorAll('[role="tab"]')];
const select = (tab) => {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  document.querySelector('.phone-screen').scrollTop = 0;
};
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    select(next);
    next.focus();
  });
});

// --- Radio groups inside the phone ---------------------------------------------------------------------------
document.querySelectorAll('.phone [role="radiogroup"]').forEach((group) => {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b || b.disabled) return;
    group.querySelectorAll('[role="radio"]').forEach((r) => r.setAttribute('aria-checked', String(r === b)));
  });
});
const picked = (section, label) => section.querySelector(`[aria-labelledby="${label}"] [aria-checked="true"]`)?.textContent;
const done = (section, text) => { const p = section.querySelector('.shop-done'); p.textContent = text; p.hidden = false; };

// Bakery: build an order and show the message the shop would receive.
const bakery = document.getElementById('screen-bakery');
const total = () => [...bakery.querySelectorAll('li')].reduce((s, li) => s + Number(li.dataset.price) * Number(li.querySelector('output').value || li.querySelector('output').textContent), 0);
bakery.addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const out = b.parentElement.querySelector('output');
  out.textContent = String(Math.max(0, Math.min(20, Number(out.textContent) + Number(b.dataset.step))));
  bakery.querySelector('[data-total]').textContent = `₹${total()}`;
  bakery.querySelector('.shop-done').hidden = true;
});
bakery.querySelector('[data-order]').addEventListener('click', () => {
  const lines = [...bakery.querySelectorAll('li')].filter((li) => Number(li.querySelector('output').textContent) > 0)
    .map((li) => `${li.querySelector('output').textContent} ${li.dataset.item}`);
  done(bakery, lines.length
    ? `Order sent to the bakery's WhatsApp: ${lines.join(', ')}. Total ₹${total()}. (Demo: nothing was sent.)`
    : 'Add something first: tap + next to an item.');
});

const salon = document.getElementById('screen-salon');
salon.querySelector('[data-book]').addEventListener('click', () => {
  done(salon, `Booked: ${picked(salon, 'salon-service')} on Saturday at ${picked(salon, 'salon-time')}. The salon gets it on WhatsApp. (Demo)`);
});

const clinic = document.getElementById('screen-clinic');
clinic.querySelector('[data-request]').addEventListener('click', () => {
  done(clinic, `Request sent: ${picked(clinic, 'clinic-reason')}, ${picked(clinic, 'clinic-day')}. The clinic calls you to confirm a time. (Demo)`);
});

// --- Entrances: each part of a section rises in turn, once --------------------------------------------------
if (!reduced && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  // Stagger the parts of each block (section or footer) in order; every .reveal on the page is observed.
  const groups = new Map();
  document.querySelectorAll('.reveal').forEach((el) => {
    const group = el.closest('section, footer') || document.body;
    const i = groups.get(group) || 0;
    groups.set(group, i + 1);
    el.style.setProperty('--d', `${i * 80}ms`);
    io.observe(el);
  });
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
}
