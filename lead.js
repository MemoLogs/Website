/* The walkthrough request: every "Book a walkthrough" opens one dialog, which
   posts to the MemoLogs lead endpoint.

   POST {base}/api/v1/accounts/lead  · JSON · no auth · no cookies
   Base URL: data-api on the dialog, or window.MEMOLOGS_API before this loads.

   What the server does not do, so the form must:
   - validate email / URL format (a bad email is stored and the confirmation
     never arrives), so both are checked here before anything is sent;
   - de-duplicate (a double submit writes two rows), so the button is disabled
     for the whole round trip;
   - reject over-length values with 422 (they 500), so every input carries the
     server's maxlength: 100 / 100 / 254 / 255 / 200.
   A 500 after a 201-worthy insert can still mean the lead was stored, so the
   generic error copy never says "nothing was sent". */
(function () {
  'use strict';

  /* The dialog is defined once, here, rather than pasted into every page.
     It is a form, not indexable content, so nothing is lost by building it
     at runtime — and the alternative is fifteen copies that drift apart.
     A page may still ship its own [data-lead-dialog] markup; that one wins. */
  var MARKUP = `
<dialog class="lead" data-lead-dialog data-api="https://app.memologs.com" aria-labelledby="lead-title">
  <form class="lead__form" data-lead-form novalidate>
    <button type="button" class="lead__close" data-lead-close aria-label="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <div class="lead__head">
      <span class="sc-label lead__kicker">Book a walkthrough</span>
      <h2 class="lead__title" id="lead-title">Bring one decision. We’ll run it through MemoLogs.</h2>
      <p class="lead__sub">A launch, a renewal or a regional media plan—whatever is on your desk. We’ll reply from a real person within one working day.</p>
    </div>
    <div class="lead__grid">
      <label class="lead__field">
        <span>First name</span>
        <input type="text" name="first_name" autocomplete="given-name" maxlength="100" required>
      </label>
      <label class="lead__field">
        <span>Last name</span>
        <input type="text" name="last_name" autocomplete="family-name" maxlength="100" required>
      </label>
      <label class="lead__field lead__field--wide">
        <span>Work email</span>
        <input type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" required>
      </label>
      <label class="lead__field">
        <span>Company <em>optional</em></span>
        <input type="text" name="organization" autocomplete="organization" maxlength="255">
      </label>
      <label class="lead__field">
        <span>Website <em>optional</em></span>
        <input type="text" name="website" autocomplete="url" inputmode="url" maxlength="200" placeholder="yourcompany.com">
      </label>
    </div>
    <p class="lead__error" data-lead-error role="alert" hidden></p>
    <div class="lead__actions">
      <button type="submit" class="cta cta--lg lead__submit" data-lead-submit><span>Request a walkthrough</span></button>
      <small class="lead__fine">We never share your details.</small>
    </div>
    <div class="lead__done" data-lead-done hidden>
      <span class="lead__check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg></span>
      <h3>Thanks—we’ve got it.</h3>
      <p data-lead-done-text>Check your inbox for a confirmation. We’ll be in touch within one working day to set a time.</p>
      <button type="button" class="cta cta--quiet" data-lead-close>Close</button>
    </div>
  </form>
</dialog>
`;

  var dialog = document.querySelector('[data-lead-dialog]');
  if (!dialog) {
    var t = document.createElement('template');
    t.innerHTML = MARKUP.trim();
    dialog = t.content.firstElementChild;
    if (!dialog) return;
    document.body.appendChild(dialog);
  }
  if (typeof dialog.showModal !== 'function') return;

  var form = dialog.querySelector('[data-lead-form]');
  var submit = dialog.querySelector('[data-lead-submit]');
  var errorEl = dialog.querySelector('[data-lead-error]');
  var doneEl = dialog.querySelector('[data-lead-done]');
  var doneText = dialog.querySelector('[data-lead-done-text]');
  var base = (dialog.getAttribute('data-api') || window.MEMOLOGS_API || '').replace(/\/+$/, '');
  var endpoint = base + '/api/v1/accounts/lead';
  var opener = null, busy = false;

  /* --------------------------------------------------------- open / close */
  function open(from) {
    opener = from || document.activeElement;
    reset();
    document.documentElement.classList.add('lead-open');
    dialog.showModal();
    var first = form.querySelector('input[name="first_name"]');
    setTimeout(function () { if (first) first.focus(); }, 60);
  }
  function close() {
    if (busy) return;
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', function () {
    document.documentElement.classList.remove('lead-open');
    if (opener && typeof opener.focus === 'function') opener.focus();
  });
  dialog.addEventListener('cancel', function (e) { if (busy) e.preventDefault(); });   // Esc while sending
  dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });  // the backdrop
  Array.prototype.forEach.call(dialog.querySelectorAll('[data-lead-close]'), function (b) { b.addEventListener('click', close); });

  // every walkthrough link on the page opens the form; the hash stays as a no-JS fallback
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href="#book"]');
    if (!a) return;
    e.preventDefault();
    open(a);
  });

  /* ---------------------------------------------------------- validation */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function field(name) { return form.querySelector('[name="' + name + '"]'); }
  function mark(input, bad) { var wrap = input.closest('.lead__field'); if (wrap) wrap.classList.toggle('is-invalid', !!bad); }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = !msg; }
  function normaliseUrl(v) {
    v = v.trim(); if (!v) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); if (!/^https?:$/.test(u.protocol) || !/\./.test(u.hostname)) return null; return u.href.replace(/\/$/, ''); }
    catch (e) { return null; }
  }
  function collect() {
    var first = field('first_name').value.trim(), last = field('last_name').value.trim();
    var email = field('email').value.trim().toLowerCase(), org = field('organization').value.trim();
    var siteRaw = field('website').value, site = normaliseUrl(siteRaw);
    var problems = [];
    mark(field('first_name'), !first); mark(field('last_name'), !last);
    if (!first || !last) problems.push('Please add your first and last name.');
    var emailOk = EMAIL.test(email) && email.length <= 254;
    mark(field('email'), !emailOk);
    if (!emailOk) problems.push('That email address doesn’t look right.');
    var siteBad = siteRaw.trim() !== '' && (site === null || site.length > 200);
    mark(field('website'), siteBad);
    if (siteBad) problems.push('That website address doesn’t look right—try something like yourcompany.com.');
    if (problems.length) return { error: problems[0] };
    var payload = { email: email, first_name: first, last_name: last };
    if (org) payload.organization = org.slice(0, 255);
    if (site) payload.website = site;
    return { payload: payload };
  }
  Array.prototype.forEach.call(form.querySelectorAll('input'), function (i) {
    i.addEventListener('input', function () { mark(i, false); if (!errorEl.hidden) showError(''); });
  });

  /* ------------------------------------------------------------- submit */
  function setBusy(on) {
    busy = on;
    submit.disabled = on;
    submit.classList.toggle('is-busy', on);
    submit.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function reset() {
    setBusy(false); showError('');
    dialog.classList.remove('is-done'); doneEl.hidden = true;
    Array.prototype.forEach.call(form.querySelectorAll('.lead__field'), function (f) { f.classList.remove('is-invalid'); });
  }
  function succeed(message) {
    if (message && /submitted/i.test(message)) message = null;   // the server's stock line; ours reads better here
    if (message) doneText.textContent = message;
    dialog.classList.add('is-done'); doneEl.hidden = false;
    form.reset();
    var btn = doneEl.querySelector('button'); if (btn) setTimeout(function () { btn.focus(); }, 40);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var c = collect();
    if (c.error) { showError(c.error); return; }
    setBusy(true);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(c.payload),
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (t) { var b = null; try { b = JSON.parse(t); } catch (err) { b = null; } return { status: res.status, body: b }; });
    }).then(function (r) {
      var b = r.body;
      // 5xx / 404 / 405 come from the dispatcher without the envelope: check "ok" first
      if (!b || typeof b !== 'object' || !('ok' in b)) throw new Error('Something went wrong on our end. Please try again in a moment.');
      if (!b.ok) throw new Error((b.error && b.error.message) || 'Please check the form and try again.');   // 422 copy is user-safe
      succeed(b.data && b.data.message);
    }).catch(function (err) {
      var msg = err && err.name === 'AbortError' ? 'That took too long. Please check your connection and try again.' : (err && err.message) || 'Something went wrong. Please try again.';
      if (err && /Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) msg = 'We couldn’t reach MemoLogs just now. Please check your connection and try again.';
      showError(msg);
    }).then(function () { if (timer) clearTimeout(timer); setBusy(false); });
  });
})();
