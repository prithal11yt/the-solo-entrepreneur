/* ============================================================
   THE SOLO ENTREPRENEUR — site.js (v2)
   Nav state, word-split reveals, staggered groups, Founders Wing
   popup, and the legacy helpers older pages still call.
   ============================================================ */
document.documentElement.classList.add('js');

(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Nav ---- */
  const nav = document.getElementById('nav');
  if (nav) {
    const sub = document.body.classList.contains('sub');
    const f = () => nav.classList.toggle('scrolled', sub || window.scrollY > 70);
    addEventListener('scroll', f, { passive: true }); f();
    const page = ((location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '')) || 'index';
    nav.querySelectorAll('.nav-links a').forEach(a => {
      const h = (a.getAttribute('href') || '').split('#')[0].replace(/^(\.\.\/)+/, '').replace(/\.html$/, '');
      if (h && h === page) a.classList.add('active');
    });
  }
  document.addEventListener('click', e => {
    const m = document.getElementById('navMobile');
    if (m && m.classList.contains('open') && !m.contains(e.target) && !e.target.closest('.nav-burger')) m.classList.remove('open');
  });

  /* ---- Word-split headings ---- */
  function splitWords(el) {
    if (el.dataset.split) return; el.dataset.split = '1';
    const nodes = [...el.childNodes]; el.innerHTML = ''; let i = 0;
    nodes.forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(t => {
          if (!t) return;
          if (/^\s+$/.test(t)) { el.appendChild(document.createTextNode(' ')); }
          else { const s = document.createElement('span'); s.className = 'w'; s.textContent = t; s.style.transitionDelay = (i * 55) + 'ms'; if (el.classList.contains('h1')) s.style.animationDelay = (180 + i * 60) + 'ms'; i++; el.appendChild(s); }
        });
      } else el.appendChild(n);
    });
  }
  document.querySelectorAll('.split').forEach(splitWords);

  /* ---- Stagger groups ---- */
  document.querySelectorAll('.stagger').forEach(g => [...g.children].forEach((c, i) => { c.classList.add('rv'); c.style.transitionDelay = (i * 80) + 'ms'; }));

  /* ---- Reveal on scroll ---- */
  const targets = document.querySelectorAll('.rv, .split, .hairline, .reveal');
  if ('IntersectionObserver' in window && !RM) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; e.target.classList.add('in', 'visible'); io.unobserve(e.target); }), { threshold: .1, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(el => io.observe(el));
  } else {
    targets.forEach(el => el.classList.add('in', 'visible'));
  }
  // Belt-and-braces: reveal whatever is already on screen, and re-check on scroll (IO can lag in background tabs)
  const inView = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.96 && r.bottom > 0; };
  const sweep = () => document.querySelectorAll('.rv:not(.in), .split:not(.in), .hairline:not(.in), .reveal:not(.in)').forEach(el => { if (inView(el)) el.classList.add('in', 'visible'); });
  setTimeout(sweep, 50); setTimeout(sweep, 400);
  let sweepT = 0; addEventListener('scroll', () => { if (sweepT) return; sweepT = setTimeout(() => { sweepT = 0; sweep(); }, 120); }, { passive: true });

  /* ---- Founders Wing popup (site-wide, once per session) ---- */
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (page.indexOf('community') === 0 || page.indexOf('fw-') === 0 || page.indexOf('account') === 0) return;
  try { if (sessionStorage.getItem('fw_pop_seen')) return; } catch (e) {}
  const FW_URL = 'https://www.founderswing.com/?utm_source=thesoloentrepreneur&utm_medium=popup&utm_campaign=fw_promo';
  const seen = () => { try { sessionStorage.setItem('fw_pop_seen', '1'); } catch (e) {} };
  function build() {
    if (document.getElementById('fwPop')) return;
    const css = document.createElement('style');
    css.textContent = `
      .fw-pop-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,20,20,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .3s}
      .fw-pop-ov.open{opacity:1}
      .fw-pop-card{position:relative;width:100%;max-width:440px;border-radius:28px;padding:36px 32px 28px;background:#fff;box-shadow:0 40px 100px rgba(0,0,0,.25);text-align:center;font-family:var(--font,system-ui);color:#141414;transform:translateY(16px) scale(.97);transition:transform .4s cubic-bezier(.2,.9,.25,1.2)}
      .fw-pop-ov.open .fw-pop-card{transform:none}
      .fw-pop-x{position:absolute;top:14px;right:16px;width:32px;height:32px;border-radius:50%;background:#f3f3f3;border:0;font-size:15px;cursor:pointer;color:#6f6f6f;display:grid;place-items:center}
      .fw-pop-x:hover{background:#e9e9e9;color:#141414}
      .fw-pop-logo{width:56px;height:56px;border-radius:16px;margin:0 auto 14px;display:block;box-shadow:0 10px 24px rgba(0,0,0,.14)}
      .fw-pop-badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.1em;color:#6f6f6f;background:#f3f3f3;padding:5px 12px;border-radius:999px;margin-bottom:14px}
      .fw-pop-card h3{font-size:30px;font-weight:650;letter-spacing:-.025em;line-height:1.05;margin:0 0 10px}
      .fw-pop-sub{font-size:15px;line-height:1.5;color:#6f6f6f;margin:0 0 18px}
      .fw-pop-list{list-style:none;margin:0 0 20px;padding:0;text-align:left;display:flex;flex-direction:column;gap:9px}
      .fw-pop-list li{display:flex;gap:10px;align-items:center;font-size:14.5px;color:#414141}
      .fw-pop-list li i{font-style:normal;width:22px;text-align:center;flex-shrink:0}
      .fw-pop-cta{display:block;width:100%;padding:14px;border-radius:999px;background:#141414;color:#fff;font-size:16px;font-weight:600;text-decoration:none;transition:transform .2s,background .2s}
      .fw-pop-cta:hover{background:#000;transform:translateY(-2px)}
      .fw-pop-scar{font-size:12px;color:#6f6f6f;margin:12px 0 0}
      .fw-pop-later{display:inline-block;margin-top:10px;font-size:13px;color:#9a9a9a;background:none;border:0;cursor:pointer}
      .fw-pop-later:hover{color:#141414}
      @media(max-width:480px){.fw-pop-card{padding:28px 22px 22px;border-radius:22px}.fw-pop-card h3{font-size:26px}}`;
    document.head.appendChild(css);
    const ov = document.createElement('div');
    ov.id = 'fwPop'; ov.className = 'fw-pop-ov';
    ov.innerHTML = `
      <div class="fw-pop-card" role="dialog" aria-modal="true" aria-label="Founders Wing">
        <button class="fw-pop-x" aria-label="Close">✕</button>
        <img class="fw-pop-logo" src="/images/fw-icon.png" alt="Founders Wing" onerror="this.style.display='none'"/>
        <div class="fw-pop-badge">FOUNDERS WING</div>
        <h3>Stop building alone.</h3>
        <p class="fw-pop-sub">India's AI-first founder community — where solo builders actually ship, together.</p>
        <ul class="fw-pop-list">
          <li><i>🎥</i> Weekly live sessions with Prithal</li>
          <li><i>🏆</i> The ₹10K Sprint Challenge + leaderboard</li>
          <li><i>🤝</i> An accountability buddy, matched to you</li>
          <li><i>💬</i> A private founder community — no lurkers</li>
        </ul>
        <a class="fw-pop-cta" href="${FW_URL}" target="_blank" rel="noopener">Explore Founders Wing →</a>
        <div class="fw-pop-scar">Founding-member pricing · limited spots</div>
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
  setTimeout(build, 6000);
})();

/* ---- Legacy helpers (older pages still call these) ---- */
function toggleMenu() { const m = document.getElementById('navMobile'); if (m) m.classList.toggle('open'); }
function copyCoupon() {
  const code = document.getElementById('couponCode')?.textContent?.trim();
  const btn = document.getElementById('copyBtn');
  if (!code || !btn) return;
  const done = () => { btn.textContent = '✓ Copied'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2400); };
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done)); else fallbackCopy(code, done);
}
function fallbackCopy(text, cb) {
  const ta = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); cb();
}
function submitLead() {
  const input = document.getElementById('leadEmail'); if (!input) return;
  const val = input.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { input.style.outline = '2px solid #141414'; input.focus(); setTimeout(() => { input.style.outline = ''; }, 1400); return; }
  alert('🎉 Check your inbox! The eBook is on its way to ' + val); input.value = '';
}
function switchTab(tab, btn) {
  document.querySelectorAll('.video-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.video-tab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('panel-' + tab); if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}
