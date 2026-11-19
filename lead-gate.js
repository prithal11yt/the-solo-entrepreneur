/* Free downloads ask for an email first (name optional), then download.
   Any <a class="download-btn" data-lead="source"> on the page is gated.
   Someone who already gave an email on this browser downloads straight away,
   and a failed save never blocks the download. */
(function () {
  var KEY = 'tse_lead_email';
  var remembered = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var remember = function (email) { try { localStorage.setItem(KEY, email); } catch (e) {} };
  var track = function (name, params) { if (typeof gtag === 'function') gtag('event', name, params); };
  var start = function (a) {
    var link = document.createElement('a');
    link.href = a.getAttribute('href'); link.download = ''; document.body.appendChild(link); link.click(); link.remove();
  };
  var save = function (body) {
    return fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  };

  var css = document.createElement('style');
  css.textContent =
    '.lg-overlay{position:fixed;inset:0;background:rgba(10,10,10,.55);display:none;align-items:center;justify-content:center;z-index:1000;padding:16px}' +
    '.lg-overlay.open{display:flex}' +
    '.lg-box{background:#fff;color:#141414;border-radius:18px;max-width:420px;width:100%;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.25);position:relative;font-family:inherit}' +
    '.lg-box h3{font-size:22px;font-weight:650;letter-spacing:-.02em;margin:0 0 6px}' +
    '.lg-box p{font-size:15px;color:#555;margin:0 0 16px;line-height:1.5}' +
    '.lg-box input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #ddd;border-radius:10px;font-size:16px;margin-bottom:10px;font-family:inherit}' +
    '.lg-box button[type=submit]{width:100%;padding:13px;border:0;border-radius:10px;background:#141414;color:#fff;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit}' +
    '.lg-box button[disabled]{opacity:.6;cursor:default}' +
    '.lg-close{position:absolute;top:10px;right:14px;background:none;border:0;font-size:24px;color:#888;cursor:pointer}' +
    '.lg-err{color:#c0392b;font-size:14px;min-height:18px;margin:2px 0 8px}' +
    '.lg-fine{font-size:12.5px!important;color:#888!important;margin:12px 0 0!important}' +
    '.lg-hp{position:absolute!important;left:-9999px!important;height:0;width:0;opacity:0}';
  document.head.appendChild(css);

  var overlay = document.createElement('div');
  overlay.className = 'lg-overlay';
  overlay.innerHTML =
    '<form class="lg-box" novalidate>' +
      '<button type="button" class="lg-close" aria-label="Close">×</button>' +
      '<h3>Where should we send updates?</h3>' +
      '<p>Your download starts right away. We\'ll email you when this skill gets an update, plus new free skills. Unsubscribe any time.</p>' +
      '<input type="email" name="email" placeholder="your@email.com" autocomplete="email" required>' +
      '<input type="text" name="name" placeholder="First name (optional)" autocomplete="given-name">' +
      '<input type="text" name="website" class="lg-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="lg-err" role="alert"></div>' +
      '<button type="submit">Download free →</button>' +
      '<p class="lg-fine">No spam. We never share your email.</p>' +
    '</form>';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(overlay); });

  var form = overlay.querySelector('form'), err = overlay.querySelector('.lg-err'), btn = form.querySelector('button[type=submit]');
  var pending = null;
  var close = function () { overlay.classList.remove('open'); document.body.style.overflow = ''; };
  overlay.querySelector('.lg-close').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email.'; form.email.focus(); return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Starting download…';
    var a = pending;
    var finish = function () { remember(email); close(); start(a); btn.disabled = false; btn.textContent = 'Download free →'; };
    save({ email: email, name: form.name.value.trim(), source: a.dataset.lead, website: form.website.value })
      .then(function (r) {
        if (r.ok) track('generate_lead', { lead_source: a.dataset.lead });
        finish();
      })
      .catch(finish);
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.download-btn[data-lead]');
    if (!a) return;
    track('download_click', { lead_source: a.dataset.lead });
    if (remembered()) return; // let the normal download happen
    e.preventDefault();
    pending = a;
    overlay.classList.add('open'); document.body.style.overflow = 'hidden';
    setTimeout(function () { form.email.focus(); }, 50);
  });
})();
