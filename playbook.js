/* The decision-loop panel: one authored stage card, driven by scroll.
   Six stages, each with its title, the generic description, the worked
   example and its small visual. Everything here is an authored, fictional
   illustration. */
window.MLPlaybook = (function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- icons -- */
  var I = {
    goal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    question: '<svg viewBox="0 0 24 24"><path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A3.5 3.5 0 0 1 4 12.5z"/><path d="M10 8.2c.5-1.4 4-1.5 4 .4 0 1.3-2 1.4-2 3"/><circle cx="12" cy="13.6" r=".7" fill="currentColor" stroke="none"/></svg>',
    bet: '<svg viewBox="0 0 24 24"><path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    rules: '<svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    experience: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M7 9V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V9"/><path d="M4 13h16"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M19 15c.3 1.7 1.3 2.7 3 3-1.7.3-2.7 1.3-3 3-.3-1.7-1.3-2.7-3-3 1.7-.3 2.7-1.3 3-3z"/></svg>',
    choice: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.5L16 9.5"/></svg>',
    action: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 4 12 2.5-6h5"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 3v5.5h-5.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 21v-5.5h5.5"/></svg>',
    // channels
    tv: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    creators: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.4-5.5 7-5.5s6.2 1.9 7 5.5"/><path d="m18 5 1 1"/></svg>',
    ooh: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M8 14v6M16 14v6M5 20h14"/></svg>',
    retail: '<svg viewBox="0 0 24 24"><path d="M4 9h16l-1 11H5z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/></svg>',
    pr: '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
    sponsor: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 21h8M9 17h6"/></svg>',
    digital: '<svg viewBox="0 0 24 24"><path d="M5 4l14 7-6 2-2 6z"/></svg>',
    person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.4-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
    snap: '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/></svg>',
    // conditions
    product: '<svg viewBox="0 0 24 24"><path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
    pricing: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
    promos: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
    season: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
    compete: '<svg viewBox="0 0 24 24"><path d="M4 20 20 4M14 4h6v6M4 14v6h6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/></svg>',
    news: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 12h10M7 15h10"/></svg>',
    reviews: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    sentiment: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 10h.01M15 10h.01"/></svg>',
    economy: '<svg viewBox="0 0 24 24"><path d="M3 21h18M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M12 3 3 8h18z"/></svg>'
  };
  function icon(name, cls) { return '<span class="pbi ' + (cls || '') + '" aria-hidden="true">' + I[name] + '</span>'; }

  /* ------------------------------------------------------- visuals -- */
  function spark(points, w, h, band) {
    w = w || 120; h = h || 34;
    var max = Math.max.apply(null, points), min = Math.min.apply(null, points);
    var pt = function (v, i) { return [(i / (points.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]; };
    var d = points.map(function (v, i) { var p = pt(v, i); return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pt(points[points.length - 1], points.length - 1);
    var area = d + ' L' + (w - 2) + ' ' + (h - 1) + ' L2 ' + (h - 1) + ' Z';
    var bandSvg = '';
    if (band) {
      var up = points.map(function (v, i) { var p = pt(v * (1 + band), i); return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + Math.max(1, p[1]).toFixed(1); }).join(' ');
      var dn = points.slice().reverse().map(function (v, j) { var i = points.length - 1 - j; var p = pt(v * (1 - band), i); return 'L' + p[0].toFixed(1) + ' ' + Math.min(h - 1, p[1]).toFixed(1); }).join(' ');
      bandSvg = '<path class="pbv__band" d="' + up + ' ' + dn + ' Z"/>';
    }
    return '<svg class="pbv__spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' + bandSvg + '<path class="pbv__area" d="' + area + '"/><path class="pbv__line" d="' + d + '"/><circle class="pbv__dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.4"/></svg>';
  }
  function ring(pct, label) {
    var r = 9, c = 2 * Math.PI * r;
    return '<span class="pbv__ring" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="' + r + '" class="pbv__ring-bg"/><circle cx="12" cy="12" r="' + r + '" class="pbv__ring-fg" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 12 12)"/></svg><b>' + label + '</b></span>';
  }
  function bar(label, pct, cls, note) {
    return '<div class="pbv__bar ' + (cls || '') + '"><span class="pbv__bar-l">' + label + '</span><span class="pbv__bar-t"><i style="width:' + Math.round(pct * 100) + '%"></i></span><span class="pbv__bar-n">' + (note || '') + '</span></div>';
  }
  function chip(html, cls) { return '<span class="pbv__chip ' + (cls || '') + '">' + html + '</span>'; }

  var V = {
    record: function () {
      return '<div class="pbv pbv--goal"><span class="pbv__num">$3.5M<small>/mo</small></span><span class="pbv__cities">' +
        ['FB', 'Search', 'Radio', 'CTV', 'TikTok', 'Retail'].map(function (c) { return '<span class="pbv__city"><i></i>' + c + '</span>'; }).join('') +
        '<small>six channels · $40M brand</small></span></div>';
    },
    proposal: function () {
      return '<div class="pbv pbv--channels">' +
        [['tv', 'Radio'], ['retail', 'Retail'], ['creators', 'TikTok'], ['ooh', 'CTV']].map(function (c) { return '<span class="pbv__ch">' + icon(c[0]) + '<small>' + c[1] + '</small></span>'; }).join('') +
        '<span class="pbv__ch pbv__ch--q">' + icon('sponsor') + '<small>FB $412K?</small></span></div>';
    },
    expectation: function () {
      return '<div class="pbv pbv--spark">' + spark([4, 4, 5, 5, 7, 8, 10, 11], 140, 36, 0.18) + '<small>Revenue actually caused, with a range</small></div>';
    },
    policy: function () {
      return '<div class="pbv pbv--rules">' + ring(0.25, '$250K') + chip(icon('person') + 'Finance above $250K') + chip(icon('rules') + 'No scaling on platform claims') + '</div>';
    },
    evidence: function () {
      return '<div class="pbv pbv--bars">' + bar('Radio', 0.9, '', '+18–22% · 3/3') + bar('Facebook', 0.3, 'is-gap', 'refused') + bar('Meta, Jul', 0.45, 'is-warn', '−8% last time') + '</div>';
    },
    authorization: function () {
      return '<div class="pbv pbv--phase">' +
        '<div class="pbv__ph"><span>Radio</span><i class="on" style="width:76%"></i><small>+$460K</small></div>' +
        '<div class="pbv__ph"><span>8 mkts</span><i class="on" style="width:60%"></i></div>' +
        '<div class="pbv__ph"><span>FB</span><i class="hold" style="width:35%"></i><small>hold</small></div>' +
        '<div class="pbv__ph"><span>Cap</span><i class="pilot" style="width:50%"></i><small>$460K</small></div></div>';
    },
    approval: function () {
      return '<div class="pbv pbv--who">' + chip(icon('person') + 'Marketing', 'is-on') + chip(icon('person') + 'Finance', 'is-on') + chip('Approved · capped ✓', 'is-ok') + '</div>';
    },
    snapshot: function () {
      var c = [['product', 'ok'], ['pricing', 'ok'], ['promos', 'off'], ['season', 'ok'], ['compete', 'warn'], ['search', 'ok'], ['news', 'warn'], ['reviews', 'ok'], ['sentiment', 'ok'], ['economy', 'ok']];
      return '<div class="pbv pbv--snap">' + c.map(function (x) { return '<span class="pbv__cond is-' + x[1] + '" title="' + x[0] + '">' + icon(x[0]) + '<i></i></span>'; }).join('') + '<small>10 conditions · captured at the moment of the choice</small></div>';
    },
    execution: function () {
      return '<div class="pbv pbv--track"><span class="pbv__seg"><i class="a" style="width:34%"></i><i class="b" style="width:33%"></i><i class="c" style="width:33%"></i></span><small><b class="a"></b>Approved <b class="b"></b>Written <b class="c"></b>Verified</small></div>';
    },
    observe: function () {
      return '<div class="pbv pbv--bars">' + bar('Radio', 1.0, '', '+19% held') + bar('Meta, Jul', 0.35, 'is-warn', '−8%') + bar('Stock', 0.5, 'is-warn', 'short') + '</div>';
    },
    outcome: function () {
      return '<div class="pbv pbv--grades">' + chip('Decision ✓', 'is-ok') + chip('Execution ✓', 'is-ok') + chip('Meta −8%', 'is-warn') + chip(icon('rules') + '91% match → held before approval', 'is-on') + '</div>';
    }
  };

  /* --------------------------------------------------------- model --
     Six stages, the same six the loop draws. Each stage holds the facts the
     example writes into it. One model feeds the sidebar, the docked loop
     view, the popup and the close list. */
  var STAGES = [
    { key: 'frame', verb: 'Frame', icon: 'goal', title: 'Set the direction.',
      generic: 'Capture the goal, the proposed investment, the expected outcome and the tradeoffs. AI turns intent into spending rules your team approves.',
      example: 'A $40M health brand, $3.5M a month across six channels. The board asks whether a $412K Facebook campaign worked—and where the next dollar goes. Rules: finance reviews moves above $250K; nothing scales on a platform’s own number.',
      vis: ['record', 'policy'], hand: 'Hands Evaluate: goal · proposal · expectation · rules',
      facts: [
        { key: 'record', label: 'Direction', short: '$40M brand. Six channels. $3.5M a month.', full: 'A $40M health brand spending $3.5M a month across six channels.' },
        { key: 'proposal', label: 'Question', short: 'Did the $412K Facebook campaign work?', full: 'Did the $412K Facebook campaign work, and where should the next dollar go?' },
        { key: 'expectation', label: 'Expectation', short: 'Revenue actually caused, not claimed.', full: 'Revenue the campaign actually caused, with a range—not what a platform claims.' },
        { key: 'policy', label: 'Rules', short: 'Finance above $250K. No scaling on platform claims.', full: 'Finance reviews any move above $250K. A platform-reported number is never enough to scale on.' }
      ] },
    { key: 'evaluate', verb: 'Evaluate', icon: 'experience', title: 'Run the experiment. Retrieve the history.',
      generic: 'Continuous geo experiments in your own markets: some cities see the campaign, some are held back. Three methods answer separately; comparable past decisions are retrieved by situation, not wording.',
      example: 'Radio is driving 18–22% more revenue than it is credited for—three of three methods agree. For Facebook the system refuses: not enough data, and it says what it needs. A July Meta scale-up that lost 8% is retrieved.',
      vis: ['evidence', 'snapshot'], hand: 'Hands Decide: verdicts · trust grade · precedents',
      facts: [
        { key: 'evidence', label: 'Evidence', short: 'Radio +18–22%, 3 of 3 agree. Facebook: refused.', full: 'Radio +18–22% more revenue than credited, three methods agree. Facebook: not enough data—refused rather than guessed.' },
        { key: 'snapshot', label: 'Context', short: 'Ten conditions, captured with the choice.', full: 'Price, promotions, competitor activity, seasonality, sentiment and more, captured with the decision.' }
      ] },
    { key: 'decide', verb: 'Decide', icon: 'ai', title: 'Recommend. Check. Authorize.',
      generic: 'AI recommends a course. Approved rules decide whether it proceeds, needs limits or review, or stops. A persuasive recommendation cannot override a spending boundary.',
      example: 'AI recommends: scale radio by $460K across eight new markets; hold Facebook until the experiment can answer. Above $250K, so finance reviews. Marketing and finance approve, with a cap.',
      vis: ['authorization', 'approval'], hand: 'Hands Act: authorized move · cap · owner',
      facts: [
        { key: 'authorization', label: 'Recommendation', short: 'Scale radio $460K, 8 markets. Hold Facebook.', full: 'Scale radio by $460K across eight new markets. Hold Facebook until the experiment can answer.' },
        { key: 'approval', label: 'Decision', short: 'Approved with a cap. Reasoning recorded.', full: 'Marketing and finance approve the move with a $460K cap. Reasoning recorded.' }
      ] },
    { key: 'act', verb: 'Act', icon: 'action', title: 'Move the money. Verify it moved.',
      generic: 'MemoLogs writes the budget change on the ad platforms inside the approved cap, then confirms the platform actually did it. Executed and verified are separate claims; both are recorded.',
      example: 'The $460K radio move is written to the platforms inside the cap and verified against what they report back. Facebook stays where it was.',
      vis: ['execution'], hand: 'Hands Observe: commitments · verified execution',
      facts: [
        { key: 'execution', label: 'Action', short: '$460K moved. Verified on the platforms.', full: '$460K moved to radio inside the approved cap, and verified against the platforms.' }
      ] },
    { key: 'observe', verb: 'Observe', icon: 'choice', title: 'Watch what actually happens.',
      generic: 'Follow delivery, business outcomes and changing conditions. Surface departures from the plan and new evidence that calls for a fresh decision.',
      example: 'Eight markets live; radio’s lift holds at +19%. In July a Meta scale-up loses 8% while a competitor discounts and stock runs short. Then the growth lead leaves.',
      vis: ['observe'], hand: 'Hands Learn: outcomes · departures · conditions',
      facts: [
        { key: 'observation', label: 'Observation', short: 'Radio +19% held. Meta scale-up −8%.', full: 'Radio held at +19% in the new markets. The July Meta scale-up lost 8% while a competitor was discounting.' }
      ] },
    { key: 'learn', verb: 'Learn', icon: 'next', title: 'Remember it, before it repeats.',
      generic: 'Grade the case, the execution and the outcome separately. Every decision becomes a precedent the next one is checked against—before approval, not in a post-mortem.',
      example: 'The new growth lead proposes the same Meta move. The system matches the situation at 91%—competitor discounting, low stock—and surfaces the loss before approval. $880K of reallocation halted. The person is gone. The reasoning is not.',
      vis: ['outcome'], hand: 'Back to Frame: every decision becomes a precedent',
      facts: [
        { key: 'outcome', label: 'Learning', short: '91% match. $880K held before approval.', full: 'The identical Meta move matched at 91% on situation and was held before approval. $880K of reallocation stopped by one retrieval.' }
      ] }
  ];
  var factByKey = {}, stageOfFact = {};
  STAGES.forEach(function (st, i) { st.i = i; st.facts.forEach(function (f) { factByKey[f.key] = f; stageOfFact[f.key] = i; }); });

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------------------------------------------------- state --
     Everything below is derived from `view`, which page.js recomputes from
     the scroll position every frame. Scrolling back rewinds it. */
  var view = { visible: {}, focus: 0, docked: false, complete: false };
  var drafts = [], seq = 0;
  var els = {
    card: document.getElementById('record'),
    feed: document.querySelector('[data-pb-feed]'),
    dots: document.querySelector('[data-pb-dots]')
  };
  els.dots.innerHTML = STAGES.map(function (st) { return '<li data-pb-dot="' + st.key + '" title="' + st.verb + '"></li>'; }).join('');

  function stageState(st) {
    var seen = st.facts.filter(function (f) { return view.visible[f.key]; }).length;
    return seen === 0 ? 'ahead' : (seen === st.facts.length ? 'done' : 'open');
  }
  function visuals(st) { return st.vis.map(function (k) { return V[k] ? V[k]() : ''; }).join(''); }

  /* ------------------------------------------------------ renderers -- */
  // the docked loop view: the stage in full
  function loopHtml(st) {
    return '<article class="pbl is-in">' +
      '<div class="pbl__head"><span class="pbl__step">' + String(st.i + 1).padStart(2, '0') + '</span><span class="pbl__verb">' + st.verb + '</span></div>' +
      '<h3>' + st.title + '</h3><p class="pbl__generic">' + st.generic + '</p>' +
      '<div class="pbl__ex"><span class="sc-label">In the example</span><p>' + st.example + '</p>' + visuals(st) + '</div>' +
      '<p class="pbl__hand">' + st.hand + '</p></article>';
  }
  function render() {
    var f = STAGES[view.focus] || STAGES[0];
    STAGES.forEach(function (st) {
      var d = els.dots.querySelector('[data-pb-dot="' + st.key + '"]');
      d.classList.toggle('is-on', stageState(st) !== 'ahead');
      d.classList.toggle('is-focus', st.i === view.focus);
    });
    els.feed.innerHTML = loopHtml(f);
  }

  var lastSig = '';
  function setView(next) {
    var sig = JSON.stringify(next);
    if (sig === lastSig) return false;
    lastSig = sig; view = next; render();
    return true;
  }

  return { stages: STAGES, stageOfFact: stageOfFact, setView: setView, visuals: V, icon: icon, chip: chip };
})();
