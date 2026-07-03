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
// Run immediately for elements already in DOM, then again after DOM is fully parsed
function observeRevealEls() {
  document.querySelectorAll('.reveal:not([data-observed])').forEach(el => {
    el.setAttribute('data-observed', '1');
    revealObserver.observe(el);
  });
}
observeRevealEls();
document.addEventListener('DOMContentLoaded', observeRevealEls);

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

/* ---- Founders Wing promo popup (site-wide) ---- */
(function () {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  // Don't nag people already looking at Founders Wing
  if (page.indexOf('community') === 0 || page.indexOf('fw-') === 0) return;
  try { if (sessionStorage.getItem('fw_pop_seen')) return; } catch (e) {}

  const FW_URL = 'https://www.founderswing.com/?utm_source=thesoloentrepreneur&utm_medium=popup&utm_campaign=fw_promo';
  const LOGO   = 'https://www.founderswing.com/logo-icon.png';
  const seen = () => { try { sessionStorage.setItem('fw_pop_seen', '1'); } catch (e) {} };

  function build() {
    if (document.getElementById('fwPop')) return;

    if (!document.getElementById('fwPopFonts')) {
      const fl = document.createElement('link');
      fl.id = 'fwPopFonts'; fl.rel = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap';
      document.head.appendChild(fl);
    }

    const css = document.createElement('style');
    css.textContent = `
      .fw-pop-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(3,7,18,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);opacity:0;transition:opacity .3s ease}
      .fw-pop-ov.open{opacity:1}
      .fw-pop-card{position:relative;width:100%;max-width:440px;border-radius:24px;padding:34px 30px;background:linear-gradient(165deg,#0f172a,#030712);border:1px solid rgba(56,189,248,.25);box-shadow:0 30px 80px rgba(0,0,0,.6);color:#fff;font-family:'Inter',system-ui,-apple-system,sans-serif;text-align:center;transform:translateY(16px) scale(.98);transition:transform .3s cubic-bezier(.2,.9,.3,1.25)}
      .fw-pop-ov.open .fw-pop-card{transform:translateY(0) scale(1)}
      .fw-pop-glow{position:absolute;top:-46px;left:50%;transform:translateX(-50%);width:220px;height:120px;background:radial-gradient(circle,rgba(14,165,233,.42),transparent 70%);filter:blur(30px);pointer-events:none}
      .fw-pop-x{position:absolute;top:13px;right:15px;background:none;border:none;color:#64748b;font-size:19px;line-height:1;cursor:pointer;transition:color .2s;z-index:2}
      .fw-pop-x:hover{color:#fff}
      .fw-pop-logo{position:relative;width:46px;height:46px;object-fit:contain;margin:0 auto 12px;display:block}
      .fw-pop-badge{position:relative;display:inline-block;font-size:11px;font-weight:700;letter-spacing:.14em;color:#38bdf8;background:rgba(14,165,233,.12);border:1px solid rgba(14,165,233,.3);padding:5px 13px;border-radius:30px;margin-bottom:14px}
      .fw-pop-card h3{position:relative;font-family:'Space Grotesk','Inter',sans-serif;font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-.02em;margin:0 0 10px}
      .fw-pop-card h3 span{background:linear-gradient(135deg,#38bdf8,#0ea5e9);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
      .fw-pop-sub{position:relative;font-size:14.5px;line-height:1.55;color:#a6b8d4;margin:0 0 18px}
      .fw-pop-list{position:relative;list-style:none;margin:0 0 20px;padding:0;text-align:left;display:flex;flex-direction:column;gap:9px}
      .fw-pop-list li{display:flex;gap:10px;align-items:center;font-size:14px;color:#d7e2f4}
      .fw-pop-list li i{font-style:normal;font-size:16px;width:22px;text-align:center;flex-shrink:0}
      .fw-pop-cta{position:relative;display:block;width:100%;padding:15px;border-radius:14px;background:linear-gradient(135deg,#0284c7,#2563eb);color:#fff;font-size:16px;font-weight:600;text-decoration:none;box-shadow:0 8px 24px rgba(2,132,199,.4);transition:transform .2s,box-shadow .2s}
      .fw-pop-cta:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(2,132,199,.55)}
      .fw-pop-scar{position:relative;font-size:12px;color:#f59e0b;margin:12px 0 0}
      .fw-pop-later{position:relative;display:inline-block;margin-top:12px;font-size:13px;color:#64748b;background:none;border:none;cursor:pointer}
      .fw-pop-later:hover{color:#a6b8d4}
      @media (max-width:480px){.fw-pop-card{padding:28px 22px;border-radius:20px}.fw-pop-card h3{font-size:23px}}
    `;
    document.head.appendChild(css);

    const ov = document.createElement('div');
    ov.id = 'fwPop';
    ov.className = 'fw-pop-ov';
    ov.innerHTML = `
      <div class="fw-pop-card" role="dialog" aria-modal="true" aria-label="Founders Wing">
        <div class="fw-pop-glow"></div>
        <button class="fw-pop-x" aria-label="Close">&times;</button>
        <img class="fw-pop-logo" src="${LOGO}" alt="Founders Wing" onerror="this.style.display='none'"/>
        <div class="fw-pop-badge">★ FOUNDERS WING</div>
        <h3>Stop building <span>alone.</span></h3>
        <p class="fw-pop-sub">You've got the ideas — Founders Wing gives you the room. India's AI-first founder community where solo builders actually ship, together.</p>
        <ul class="fw-pop-list">
          <li><i>🎥</i> Weekly live sessions with Prithal</li>
          <li><i>🏆</i> The ₹10K Sprint Challenge + leaderboard</li>
          <li><i>🤝</i> An accountability buddy, matched to you</li>
          <li><i>💬</i> A private founder community — no lurkers</li>
        </ul>
        <a class="fw-pop-cta" href="${FW_URL}" target="_blank" rel="noopener">Explore Founders Wing →</a>
        <div class="fw-pop-scar">🔥 Founding-member pricing — limited spots</div>
        <br/><button class="fw-pop-later" type="button">Maybe later</button>
      </div>`;
    document.body.appendChild(ov);

    const close = () => { ov.classList.remove('open'); seen(); setTimeout(() => ov.remove(), 320); };
    ov.querySelector('.fw-pop-x').addEventListener('click', close);
    ov.querySelector('.fw-pop-later').addEventListener('click', close);
    ov.querySelector('.fw-pop-cta').addEventListener('click', seen);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    requestAnimationFrame(() => ov.classList.add('open'));
  }

  // Show ~5s after landing (once the visitor has settled in)
  setTimeout(build, 5000);
})();
