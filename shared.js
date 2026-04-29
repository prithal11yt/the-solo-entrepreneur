/* ============================================================
   THE SOLO ENTREPRENEUR — Shared JavaScript
   ============================================================ */

/* ---- Mobile nav ---- */
function toggleMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu   = document.getElementById('mobileMenu');
  const toggle = document.querySelector('.nav-toggle');
  if (menu && menu.classList.contains('open') &&
      !menu.contains(e.target) && e.target !== toggle) {
    menu.classList.remove('open');
  }
});

/* ---- Scroll reveal ---- */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
  });
}, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ---- Copy coupon ---- */
function copyCoupon() {
  const code = document.getElementById('couponCode')?.textContent?.trim();
  const btn  = document.getElementById('copyBtn');
  if (!code || !btn) return;
  const done = () => {
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2400);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
  } else { fallbackCopy(code, done); }
}
function fallbackCopy(text, cb) {
  const ta = Object.assign(document.createElement('textarea'), {
    value: text, style: 'position:fixed;opacity:0'
  });
  document.body.appendChild(ta); ta.select(); document.execCommand('copy');
  document.body.removeChild(ta); cb();
}

/* ---- Lead magnet submit ---- */
function submitLead() {
  const input = document.getElementById('leadEmail');
  if (!input) return;
  const val = input.value.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(val)) {
    input.style.outline = '2px solid var(--accent)';
    input.focus();
    setTimeout(() => { input.style.outline = ''; }, 1400);
    return;
  }
  // Replace with your actual email service (Mailchimp, ConvertKit, etc.)
  alert('🎉 Check your inbox! The eBook is on its way to ' + val);
  input.value = '';
}

/* ---- Shared video tab switcher ---- */
function switchTab(tab, btn) {
  document.querySelectorAll('.video-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.video-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + tab);
  if (panel) {
    panel.classList.add('active');
    const grid = panel.querySelector('.video-grid');
    if (grid) { grid.style.animation = 'none'; void grid.offsetHeight; grid.style.animation = ''; }
  }
  if (btn) btn.classList.add('active');
}

/* ---- Smooth active nav link ---- */
(function() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href === page || (page === '' && href === 'index.html') ||
        (href.includes('#') && href.split('#')[0] === page)) {
      a.classList.add('active');
    }
  });
})();
