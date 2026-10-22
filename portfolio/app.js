// The live phone demos and the contact links. The street itself is street.js.

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
  if (board) board.textContent = shopInput.value.trim() || 'Your shop';
  updateLinks();
});

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
