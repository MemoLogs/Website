/* The Decision Loop Sandbox.
   The full-view dialog becomes a tool: a visitor edits their situation and
   guardrails, and the six stages are re-run by the MemoLogs backend. The page
   never calls a model vendor; it calls one MemoLogs endpoint (see API.md).
   Without a configured endpoint it runs a deterministic local mock so the
   front end is fully testable. The composite sample is always the fallback. */
window.MLSandbox = (function () {
  'use strict';
  var PB = window.MLPlaybook;
  if (!PB) return null;
  var dialog = document.querySelector('[data-pb-dialog]');
  if (!dialog) return null;
  var API = dialog.getAttribute('data-api') || window.MEMOLOGS_API || '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmtK = function (k) { return k >= 1000 ? '$' + (k / 1000).toFixed(k % 1000 ? 1 : 0) + 'M' : '$' + Math.round(k) + 'K'; };

  var CHANNELS = [['facebook', 'Facebook / Meta'], ['search', 'Google search'], ['shopping', 'Shopping ads'], ['tiktok', 'TikTok'], ['ctv', 'Connected TV'], ['retail', 'Retail media'], ['radio', 'Radio'], ['sponsorship', 'Sponsorships']];
  var SAMPLE = {
    situation: { revenue_musd: 40, spend_kusd_month: 3500, channels: ['facebook', 'search', 'shopping', 'tiktok', 'ctv', 'retail'], question: 'Did the $412K Facebook campaign work?' },
    guardrails: { finance_review_kusd: 250, platform_claims_block: true, audience_limit_kusd: 120, policy_text: '' }
  };
  var state = { input: JSON.parse(JSON.stringify(SAMPLE)), lead: null, run: 0, busy: false, result: null, last: null, source: 'sample', dirty: false, gateOpen: false, error: '' };
  try { var saved = localStorage.getItem('ml-lead'); if (saved) state.lead = JSON.parse(saved); } catch (e) {}

  /* ---------------------------------------------------------- markup -- */
  var body = dialog.querySelector('.pbd__inner');
  body.innerHTML =
    '<header class="pbd__head"><div class="pb__title"><b>Decision Loop Sandbox</b><small>Run the six stages on your own situation and guardrails</small></div>' +
    '<button type="button" class="pbd__close" data-pb-close aria-label="Close">Close</button></header>' +
    '<div class="sb">' +
      '<form class="sb__rail" data-sb-form novalidate>' +
        step(1, 'Your situation',
          field('Annual revenue', '<div class="sb__unit"><span>$</span><input type="number" name="revenue_musd" min="1" max="5000" step="1" inputmode="numeric"><span>M</span></div>') +
          field('Monthly ad spend', '<div class="sb__unit"><span>$</span><input type="number" name="spend_kusd_month" min="10" max="200000" step="10" inputmode="numeric"><span>K</span></div>') +
          field('Channels in play', '<div class="sb__chips" data-sb-channels>' + CHANNELS.map(function (c) { return '<label class="sb__chip"><input type="checkbox" name="channels" value="' + c[0] + '"><span>' + c[1] + '</span></label>'; }).join('') + '</div>') +
          field('The question on the table', '<input type="text" name="question" maxlength="140" placeholder="Did the $412K Facebook campaign work?">')) +
        step(2, 'Your guardrails',
          field('Finance reviews any move above', '<div class="sb__unit"><span>$</span><input type="number" name="finance_review_kusd" min="0" max="100000" step="10" inputmode="numeric"><span>K</span></div>') +
          field('Shared audience limit', '<div class="sb__unit"><span>$</span><input type="number" name="audience_limit_kusd" min="0" max="100000" step="10" inputmode="numeric"><span>K</span></div>') +
          '<label class="sb__toggle"><input type="checkbox" name="platform_claims_block"><span>A platform-reported number is never enough to scale on</span></label>' +
          field('Your own policy <em>optional</em>', '<textarea name="policy_text" rows="2" maxlength="280" placeholder="e.g. No annual commitments without a pilot first."></textarea>')) +
        step(3, 'Run the loop',
          '<button type="submit" class="cta sb__run" data-sb-run>Run the loop</button>' +
          '<p class="sb__note" data-sb-note>The first run asks for a name and a work email; after that, change anything and run again.</p>') +
      '</form>' +
      '<section class="sb__out" aria-live="polite">' +
        '<div class="sb__status"><span class="sb__dot" data-sb-dot></span><span data-sb-status>Waiting for your inputs</span><span class="sb__run-id" data-sb-runid></span></div>' +
        '<div class="sb__idle" data-sb-idle>' +
          '<div class="sb__mark" aria-hidden="true">' +
            '<div class="sb__orbit">' + ['Frame', 'Evaluate', 'Decide', 'Act', 'Observe', 'Learn'].map(function (v, i) { return '<i style="--i:' + i + '"><em>' + v + '</em></i>'; }).join('') + '</div>' +
            '<img class="sb__logo" src="' + (dialog.querySelector('[data-sb-logo]') ? dialog.querySelector('[data-sb-logo]').getAttribute('src') : 'assets/logo-mark.webp') + '" alt="">' +
          '</div>' +
          '<p class="sb__idle-h" data-sb-idle-h>Describe your situation. Set your guardrails. Run the loop.</p>' +
          '<p class="sb__idle-p" data-sb-idle-p>The six stages fill in here, generated for your numbers — not a demo script.</p>' +
        '</div>' +
        '<div class="pbd__grid sb__grid" data-pb-dialog-body hidden></div>' +
        '<p class="pbd__hint" data-sb-hint>Nothing here touches a real ad account. Results are generated for the situation you describe and are illustrative, not advice.</p>' +
      '</section>' +
      '<form class="sb__gate" data-sb-gate hidden novalidate>' +
        '<div class="sb__gate-inner">' +
          '<span class="sc-label">One step before it runs on your numbers</span>' +
          '<h3>Where should we send the record?</h3>' +
          '<p>Your run is saved as a decision record. We email you a link to it, and nothing else unless you ask.</p>' +
          field('Name', '<input type="text" name="name" autocomplete="name" required maxlength="80">') +
          field('Work email', '<input type="email" name="email" autocomplete="email" required maxlength="120" placeholder="you@company.com">') +
          field('Company', '<input type="text" name="company" autocomplete="organization" required maxlength="80">') +
          '<p class="sb__err" data-sb-gate-err hidden></p>' +
          '<div class="sb__gate-actions"><button type="submit" class="cta">Run on my numbers</button><button type="button" class="pbd__close" data-sb-gate-cancel>Not now</button></div>' +
        '</div>' +
      '</form>' +
    '</div>';

  function step(n, title, inner) { return '<fieldset class="sb__step"><legend><i>' + String(n).padStart(2, '0') + '</i>' + title + '</legend>' + inner + '</fieldset>'; }
  function field(label, control) { return '<label class="sb__field"><span class="sb__label">' + label + '</span>' + control + '</label>'; }

  var form = body.querySelector('[data-sb-form]'), gate = body.querySelector('[data-sb-gate]'), grid = body.querySelector('[data-pb-dialog-body]');
  var statusEl = body.querySelector('[data-sb-status]'), dotEl = body.querySelector('[data-sb-dot]'), runIdEl = body.querySelector('[data-sb-runid]'), noteEl = body.querySelector('[data-sb-note]'), runBtn = body.querySelector('[data-sb-run]');

  function fill() {
    var i = state.input;
    form.revenue_musd.value = i.situation.revenue_musd; form.spend_kusd_month.value = i.situation.spend_kusd_month; form.question.value = i.situation.question;
    Array.prototype.forEach.call(form.querySelectorAll('[name="channels"]'), function (cb) { cb.checked = i.situation.channels.indexOf(cb.value) >= 0; });
    form.finance_review_kusd.value = i.guardrails.finance_review_kusd; form.audience_limit_kusd.value = i.guardrails.audience_limit_kusd;
    form.platform_claims_block.checked = !!i.guardrails.platform_claims_block; form.policy_text.value = i.guardrails.policy_text || '';
  }
  function read() {
    var chans = Array.prototype.filter.call(form.querySelectorAll('[name="channels"]'), function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    return {
      situation: { revenue_musd: num(form.revenue_musd.value, 40), spend_kusd_month: num(form.spend_kusd_month.value, 3500), channels: chans, question: (form.question.value || '').trim() || SAMPLE.situation.question },
      guardrails: { finance_review_kusd: num(form.finance_review_kusd.value, 250), platform_claims_block: form.platform_claims_block.checked, audience_limit_kusd: num(form.audience_limit_kusd.value, 120), policy_text: (form.policy_text.value || '').trim() }
    };
  }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : d; }
  function isSample(input) { return JSON.stringify(input) === JSON.stringify(SAMPLE); }

  /* ------------------------------------------------------- rendering -- */
  function stageCard(st, changed) {
    var facts = (st.facts || []).map(function (f) { return '<div class="pbf"><span class="pbf__k">' + esc(f.label) + '</span><span class="pbf__val">' + esc(f.full || f.short) + '</span></div>'; }).join('');
    var vis = '';
    if (st.bars && st.bars.length) vis += '<div class="pbv pbv--bars">' + st.bars.map(function (b) { return '<div class="pbv__bar ' + (b.state === 'warn' ? 'is-warn' : b.state === 'gap' ? 'is-gap' : '') + '"><span class="pbv__bar-l">' + esc(b.label) + '</span><span class="pbv__bar-t"><i style="width:' + Math.round(Math.max(0, Math.min(1, b.pct)) * 100) + '%"></i></span><span class="pbv__bar-n">' + esc(b.note || '') + '</span></div>'; }).join('') + '</div>';
    if (st.chips && st.chips.length) vis += '<div class="pbv pbv--grades">' + st.chips.map(function (c) { return PB.chip(esc(c.text), c.state === 'ok' ? 'is-ok' : c.state === 'warn' ? 'is-warn' : c.state === 'gap' ? 'is-gap' : 'is-on'); }).join('') + '</div>';
    if (!vis && st.sampleVisuals) vis = st.sampleVisuals;
    return '<article class="pbe pbe--' + esc(st.key) + ' is-done' + (changed ? ' is-changed' : '') + '" data-pb-entry="' + esc(st.key) + '">' +
      '<div class="pbe__head">' + PB.icon(st.icon || 'goal', 'pbi--step') + '<span class="pbe__label">' + esc(st.verb) + '</span><span class="pbe__n">' + String(st.i + 1).padStart(2, '0') + ' / 06' + (changed ? ' · changed' : '') + '</span></div>' +
      '<p class="sb__title">' + esc(st.title) + '</p>' +
      '<p class="sb__example">' + esc(st.example) + '</p>' +
      (facts ? '<div class="pbf-list">' + facts + '</div>' : '') + vis + '</article>';
  }
  function sampleStages() {
    return PB.stages.map(function (st) {
      return { key: st.key, i: st.i, verb: st.verb, icon: st.icon, title: st.title, example: st.example, hand: st.hand, facts: st.facts.map(function (f) { return { key: f.key, label: f.label, short: f.short, full: f.full }; }), sampleVisuals: st.vis.map(function (k) { return PB.visuals[k] ? PB.visuals[k]() : ''; }).join('') };
    });
  }
  function renderStages(stages, prev) {
    grid.innerHTML = stages.map(function (st, i) {
      var was = prev && prev[i];
      var changed = !!(was && (was.example !== st.example || JSON.stringify(was.facts) !== JSON.stringify(st.facts)));
      return stageCard(st, changed);
    }).join('');
  }
  function setStatus(kind, text, runId) {
    dotEl.className = 'sb__dot is-' + kind; statusEl.textContent = text; runIdEl.textContent = runId ? '· ' + runId : '';
  }

  /* -------------------------------------------------------- the run -- */
  function onSubmit(e) {
    e.preventDefault();
    if (state.busy) return;
    var input = read();
    if (!input.situation.channels.length) { setStatus('warn', 'Pick at least one channel.'); return; }
    state.input = input;
    if (!state.lead) { openGate(); return; }
    run();
  }
  var idle = body.querySelector('[data-sb-idle]');
  function showIdle() { idle.hidden = false; grid.hidden = true; setStatus('idle', 'Waiting for your inputs', ''); }
  function showResults() { idle.hidden = true; grid.hidden = false; }
  function openGate() {
    state.gateOpen = true; gate.hidden = false; form.setAttribute('inert', ''); grid.setAttribute('inert', '');
    setTimeout(function () { gate.querySelector('[name="name"]').focus(); }, 30);
  }
  function closeGate() { state.gateOpen = false; gate.hidden = true; form.removeAttribute('inert'); grid.removeAttribute('inert'); }
  var FREE = /@(gmail|yahoo|hotmail|outlook|icloud|aol|proton|protonmail|live|msn|me)\./i;
  function onGate(e) {
    e.preventDefault();
    var err = gate.querySelector('[data-sb-gate-err]');
    var lead = { name: gate.name.value.trim(), email: gate.email.value.trim(), company: gate.company.value.trim() };
    var bad = !lead.name ? 'Please add your name.' : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email) ? 'That email doesn’t look right.' : FREE.test(lead.email) ? 'Please use your work email.' : !lead.company ? 'Please add your company.' : '';
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    err.hidden = true; state.lead = lead;
    try { localStorage.setItem('ml-lead', JSON.stringify(lead)); } catch (x) {}
    closeGate(); run();
  }
  function run() {
    state.busy = true; state.run += 1; runBtn.disabled = true; runBtn.textContent = 'Running…';
    setStatus('busy', 'Running the loop on your values…', '');
    idle.classList.add('is-busy'); grid.classList.add('is-busy');
    var payload = { lead: state.lead, situation: state.input.situation, guardrails: state.input.guardrails, sample_id: 'composite-health-v1', client: { page: location.hostname || 'local', run: state.run } };
    var prev = state.result;
    request(payload).then(function (res) {
      var stages = normalise(res);
      state.last = prev; state.result = stages; state.source = res.sample ? 'sample' : 'live';
      showResults(); renderStages(stages, prev);
      setStatus(res.sample ? 'sample' : 'live', (res.sample ? 'Sample' : 'Run ' + state.run + ' · your values') + (res.mock ? ' · local mock, no backend configured' : ' · via MemoLogs'), res.run_id || '');
      noteEl.textContent = res.sample ? noteEl.textContent : 'Change a value and run again. Stages that changed are marked.';
    }).catch(function (err) {
      setStatus('error', 'MemoLogs couldn’t run that just now. Please try again in a moment. ' + (err && err.message ? '(' + err.message + ')' : ''), '');
      if (!state.result) { idle.querySelector('[data-sb-idle-h]').textContent = 'That run didn’t go through.'; idle.querySelector('[data-sb-idle-p]').textContent = 'Nothing was lost — your inputs are still here. Run the loop again.'; }
    }).then(function () { state.busy = false; runBtn.disabled = false; runBtn.textContent = 'Run the loop'; grid.classList.remove('is-busy'); idle.classList.remove('is-busy'); });
  }
  function request(payload) {
    if (!API) return new Promise(function (ok) { setTimeout(function () { ok(mock(payload)); }, 900); });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    return fetch(API.replace(/\/$/, '') + '/v1/loop/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !Array.isArray(j.stages) || j.stages.length !== 6) throw new Error('bad response'); return j; })
      .then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function normalise(res) {
    var base = PB.stages;
    return res.stages.map(function (st, i) {
      var b = base[i] || {};
      return { key: st.key || b.key, i: i, verb: st.verb || b.verb, icon: b.icon, title: st.title || b.title, example: st.example || '', hand: st.hand || b.hand, facts: Array.isArray(st.facts) ? st.facts : [], bars: st.bars, chips: st.chips };
    });
  }

  /* ---------------------------------------------- deterministic mock --
     Stands in for the backend. Same contract, same shape; the numbers are
     derived from the visitor's inputs so every change visibly matters. */
  function mock(p) {
    var s = p.situation, g = p.guardrails;
    var spend = s.spend_kusd_month, rev = s.revenue_musd;
    var has = function (c) { return s.channels.indexOf(c) >= 0; };
    var move = Math.round(spend * 0.13 / 10) * 10;                  // the recommended radio/CTV move
    var winner = has('radio') ? 'Radio' : has('ctv') ? 'Connected TV' : has('search') ? 'Google search' : 'Retail media';
    var loser = has('facebook') ? 'Facebook' : has('tiktok') ? 'TikTok' : 'Shopping ads';
    var lift = Math.max(6, Math.min(24, Math.round(18 - (spend / 1000)))), liftHi = lift + 4;
    var review = move > g.finance_review_kusd;
    var creators = Math.round(spend * 0.017 / 10) * 10, retail = Math.round(spend * 0.011 / 10) * 10, agent = Math.round(spend * 0.01 / 10) * 10;
    var combined = creators + retail + agent, held = combined > g.audience_limit_kusd;
    var claimHold = g.platform_claims_block;
    var policy = g.policy_text ? ' Your policy is on record: “' + g.policy_text + '.”' : '';
    var st = [
      { key: 'frame', verb: 'Frame', title: 'Set the direction.',
        example: 'A $' + rev + 'M brand, ' + fmtK(spend) + ' a month across ' + s.channels.length + ' channel' + (s.channels.length === 1 ? '' : 's') + '. The question: “' + s.question + '” Rules: finance reviews moves above ' + fmtK(g.finance_review_kusd) + '; a shared audience limit of ' + fmtK(g.audience_limit_kusd) + '.' + policy,
        facts: [{ key: 'record', label: 'Direction', full: '$' + rev + 'M brand. ' + s.channels.length + ' channels. ' + fmtK(spend) + ' a month.' }, { key: 'proposal', label: 'Question', full: s.question }, { key: 'policy', label: 'Rules', full: 'Finance above ' + fmtK(g.finance_review_kusd) + '. Audience limit ' + fmtK(g.audience_limit_kusd) + '. ' + (claimHold ? 'No scaling on platform claims.' : 'Platform claims may be scaled on.') }] },
      { key: 'evaluate', verb: 'Evaluate', title: 'Run the experiment. Retrieve the history.',
        example: winner + ' is driving ' + lift + '–' + liftHi + '% more revenue than it is credited for — three of three methods agree. ' + (claimHold ? 'For ' + loser + ' the system refuses: not enough experiment data, and it says what it needs.' : 'For ' + loser + ' only a platform-reported number exists; your rules allow scaling on it, so it is graded low-trust rather than refused.') + ' A comparable past move on ' + loser + ' that lost 8% is retrieved.',
        facts: [{ key: 'evidence', label: 'Evidence', full: winner + ' +' + lift + '–' + liftHi + '%, 3 of 3 agree. ' + loser + ': ' + (claimHold ? 'refused.' : 'low-trust claim.') }, { key: 'snapshot', label: 'Context', full: 'Price, promotions, competitor activity, seasonality and sentiment captured with the decision.' }],
        bars: [{ label: winner, pct: 0.9, note: '+' + lift + '–' + liftHi + '% · 3/3' }, { label: loser, pct: claimHold ? 0.3 : 0.5, state: claimHold ? 'gap' : 'warn', note: claimHold ? 'refused' : 'low trust' }, { label: loser + ', past', pct: 0.45, state: 'warn', note: '−8% last time' }] },
      { key: 'decide', verb: 'Decide', title: 'Recommend. Check. Authorize.',
        example: 'AI recommends: scale ' + winner + ' by ' + fmtK(move) + '; ' + (claimHold ? 'hold ' + loser + ' until the experiment can answer.' : 'leave ' + loser + ' flat pending a test.') + (review ? ' The move is above your ' + fmtK(g.finance_review_kusd) + ' threshold, so finance reviews before approval.' : ' The move sits under your ' + fmtK(g.finance_review_kusd) + ' threshold, so marketing can approve it directly.') + ' Approved with a cap of ' + fmtK(move) + '.',
        facts: [{ key: 'authorization', label: 'Recommendation', full: 'Scale ' + winner + ' by ' + fmtK(move) + '. ' + (claimHold ? 'Hold ' + loser + '.' : loser + ' flat.') }, { key: 'approval', label: 'Decision', full: (review ? 'Finance reviewed. ' : 'Within marketing’s authority. ') + 'Approved with a ' + fmtK(move) + ' cap. Reasoning recorded.' }],
        chips: [{ text: 'Marketing', state: 'on' }, { text: review ? 'Finance review' : 'No finance review needed', state: review ? 'warn' : 'ok' }, { text: 'Capped ' + fmtK(move) + ' ✓', state: 'ok' }] },
      { key: 'act', verb: 'Act', title: 'Move the money. Verify it moved.',
        example: fmtK(move) + ' is written to ' + winner + ' inside the cap and verified against what the platform reports back. Meanwhile three requests land on the same audience: creators +' + fmtK(creators) + ', retail media +' + fmtK(retail) + ', and an agent’s paid-social change +' + fmtK(agent) + ' — ' + fmtK(combined) + ' against your ' + fmtK(g.audience_limit_kusd) + ' limit, so ' + (held ? 'the last one is held by rule, not judgment.' : 'all three proceed; the limit holds.'),
        facts: [{ key: 'execution', label: 'Action', full: fmtK(move) + ' moved and verified. Shared audience: ' + fmtK(combined) + ' of ' + fmtK(g.audience_limit_kusd) + (held ? ' — held.' : ' — within limit.') }],
        bars: [{ label: 'Committed', pct: Math.min(1, (held ? creators + retail : combined) / Math.max(1, g.audience_limit_kusd)), note: fmtK(held ? creators + retail : combined) }, { label: 'Held', pct: held ? Math.min(1, agent / Math.max(1, g.audience_limit_kusd)) : 0, state: 'warn', note: held ? fmtK(agent) : '—' }] },
      { key: 'observe', verb: 'Observe', title: 'Watch what actually happens.',
        example: 'New markets live; ' + winner + '’s lift holds at +' + (lift + 1) + '%. A later ' + loser + ' scale-up loses 8% while a competitor discounts and stock runs short. Then the growth lead leaves.',
        facts: [{ key: 'observation', label: 'Observation', full: winner + ' +' + (lift + 1) + '% held. ' + loser + ' scale-up −8%.' }],
        bars: [{ label: winner, pct: 1, note: '+' + (lift + 1) + '% held' }, { label: loser, pct: 0.35, state: 'warn', note: '−8%' }, { label: 'Stock', pct: 0.5, state: 'warn', note: 'short' }] },
      { key: 'learn', verb: 'Learn', title: 'Remember it, before it repeats.',
        example: 'The new growth lead proposes the same ' + loser + ' move. The system matches the situation at 91% — competitor discounting, low stock — and surfaces the loss before approval. ' + fmtK(Math.round(spend * 0.25 / 10) * 10) + ' of reallocation held. The person is gone. The reasoning is not.',
        facts: [{ key: 'outcome', label: 'Learning', full: '91% match. ' + fmtK(Math.round(spend * 0.25 / 10) * 10) + ' held before approval.' }],
        chips: [{ text: 'Decision ✓', state: 'ok' }, { text: 'Execution ✓', state: 'ok' }, { text: loser + ' −8%', state: 'warn' }, { text: '91% match → held', state: 'on' }] }
    ];
    return { run_id: 'mock-' + Date.now().toString(36).slice(-5), sample: false, mock: true, stages: st };
  }

  /* --------------------------------------------------------- wiring -- */
  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', function () { state.dirty = true; noteEl.textContent = state.lead ? 'Run the loop to see what changed.' : 'Run the loop. The first run asks for a name and a work email.'; });
  gate.addEventListener('submit', onGate);
  gate.querySelector('[data-sb-gate-cancel]').addEventListener('click', closeGate);
  dialog.addEventListener('close', closeGate);
  // the playbook's own dialog click-handler renders its list into [data-pb-dialog-body]; we own that node now, so re-render after it opens
  var origOpen = PB.open;
  function open() { origOpen(); fill(); if (!state.result) showIdle(); else { showResults(); renderStages(state.result, null); } }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-pb-open]') || e.target.closest('[data-pb-row]') || e.target.closest('[data-pb-strip]')) { setTimeout(function () { fill(); if (!state.result) showIdle(); else { showResults(); renderStages(state.result, null); } }, 0); }
  });
  fill();
  return { open: open, state: state, mock: mock, SAMPLE: SAMPLE };
})();
