// Pre-Token Radar's dashboard. It reads window.RADAR (written beside this
// dashboard by main.ts) and renders the ranked board, the search, the category
// and chain filters, a per-protocol detail drawer with the model's own inputs
// and the farm plan, and a separate live-token view. No network: every byte it
// shows arrived in data.js, and the drawer's model panel recomputes the same
// arithmetic lib/model.ts runs, so the page and board.json visibly agree.
//
// Deep links: #row/<slug> opens a protocol's drawer; #chain/<name> pre-filters
// a chain; #cat/<category> pre-filters a category.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');

  var M = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };
  applyHash(location.hash);

  function applyHash(hash) {
    var h = (hash || '').replace(/^#\/?/, '');
    if (h.slice(0, 4) === 'row/') { state.tab = 'board'; state.selected = decodeURIComponent(h.slice(4)); }
    if (h.slice(0, 6) === 'chain/') { state.tab = 'board'; state.chain = decodeURIComponent(h.slice(6)); }
    if (h.slice(0, 4) === 'cat/') { state.tab = 'board'; state.category = decodeURIComponent(h.slice(4)); }
  }

  var fmtUsd = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  };
  var fmtPct = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return '<span class="zero">n/a</span>';
    var c = n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
    return '<span class="' + c + '">' + (n > 0 ? '+' : '') + n.toFixed(2) + '%</span>';
  };
  var fmtAge = function (d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  };

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * M.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var ageMult = M.age_floor + (Math.min(Math.max(age, 0), M.age_cap_days) / M.age_cap_days) * (1 - M.age_floor);
    return Math.max(1, Math.round(row.tvl_usd * M.launch_multiple * growthMult * ageMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function chips(list, limit) {
    var wrap = el('span', { class: 'chips' });
    list.slice(0, limit || 4).forEach(function (c) { wrap.appendChild(el('span', { class: 'chip', text: c })); });
    if (limit && list.length > limit) wrap.appendChild(el('span', { class: 'chip', text: '+' + (list.length - limit) }));
    return wrap;
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = 1; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort();
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + r.chains.join(' ') + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : a[key === 'tvl' ? 'tvl_usd' : key];
      var vb = key === 'implied' ? b.implied_value_usd : b[key === 'tvl' ? 'tvl_usd' : key];
      if (typeof va === 'string' || typeof vb === 'string') return state.dir * (String(va) < String(vb) ? -1 : 1);
      return state.dir * ((va === null || va === undefined ? -1e15 : va) - (vb === null || vb === undefined ? -1e15 : vb));
    });
    return rows;
  }

  function renderTop() {
    var meta = document.getElementById('meta');
    meta.innerHTML = '';
    meta.appendChild(el('div', { html: 'snapshot <b>' + DATA.as_of + '</b> · DefiLlama protocol index · ' + DATA.source.replace(/^.*fetch /, 'fetched ') }));
    meta.appendChild(el('div', { html: 'watchlist <b>' + DATA.watchlist_size + '</b> · board <b>' + DATA.board_size + '</b> · early <b>' + DATA.early_size + '</b> · live aside <b>' + DATA.live_size + '</b>' }));
    var mv = document.getElementById('model-version');
    mv.textContent = DATA.model_version.toUpperCase();
  }

  function renderModel() {
    return el('div', { class: 'model' },
      el('span', { class: 'k', text: 'model ' + DATA.model_version + ': ' }),
      el('span', { html: 'implied = <span class="f">tvl_usd × ' + M.launch_multiple + '</span> × (1 + clamp(change_7d, ' + M.growth_floor + ', +' + M.growth_cap + ')/100 × <span class="f">' + M.growth_weight + '</span>) × age factor <span class="f">' + M.age_floor + '→1.0</span> over <span class="f">' + M.age_cap_days + '</span> days. ' }),
      el('span', { class: 'k', text: 'Every figure comes from the sealed snapshot; no protocol is special-cased.' }));
  }

  function renderControls() {
    var cats = categories();
    var chns = chains();
    var bar = el('div', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; renderTable(); });
    var cat = el('select', { 'aria-label': 'Category' });
    cat.appendChild(el('option', { value: 'all', text: 'All categories' }));
    cats.forEach(function (c) { cat.appendChild(el('option', { value: c, text: c, selected: c === state.category ? '' : null })); });
    cat.addEventListener('change', function () { state.category = cat.value; renderTable(); });
    var chain = el('select', { 'aria-label': 'Chain' });
    chain.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chns.forEach(function (c) { chain.appendChild(el('option', { value: c, text: c, selected: c === state.chain ? '' : null })); });
    chain.addEventListener('change', function () { state.chain = chain.value; renderTable(); });
    var tabs = el('div', { class: 'tabbar' });
    tabs.appendChild(el('button', { class: state.tab === 'board' ? 'on' : '', text: 'Pre-token board', onclick: function () { state.tab = 'board'; render(); } }));
    tabs.appendChild(el('button', { class: state.tab === 'live' ? 'on' : '', text: 'Live token (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; render(); } }));
    bar.appendChild(search);
    bar.appendChild(cat);
    bar.appendChild(chain);
    bar.appendChild(tabs);
    return bar;
  }

  function renderTable() {
    var wrap = el('div', { class: 'table' });
    var cols = [
      { k: 'rank', t: 'Rank' },
      { k: 'name', t: 'Protocol' },
      { k: 'tvl', t: 'TVL' },
      { k: 'change_7d', t: '7d' },
      { k: 'age_days', t: 'Age' },
      { k: 'implied', t: 'Implied value' },
      { k: 'wl', t: 'Watchlist' },
    ];
    var table = el('table');
    var thead = el('thead');
    var trh = el('tr');
    cols.forEach(function (c) {
      var th = el('th', { text: c.t, onclick: function () { if (state.sort === c.k) state.dir *= -1; else { state.sort = c.k; state.dir = c.k === 'name' ? 1 : -1; } renderTable(); } });
      if (state.sort === c.k) th.className = 'on';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    var tbody = el('tbody');
    var rows = state.tab === 'live' ? DATA.live : filtered();
    var count = el('span', { class: 'count', text: (state.tab === 'live' ? DATA.live_size : rows.length) + ' shown' });
    document.querySelector('.count') && document.querySelector('.count').replaceWith(count);
    if (state.tab === 'live') {
      rows.forEach(function (r) {
        var tr = el('tr', { class: 'live' });
        tr.appendChild(el('td', { class: 'rank', text: '#' }));
        tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('div', { class: 'cat', text: (r.category || 'uncategorized') })));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { html: fmtPct(r.change_7d) }));
        tr.appendChild(el('td', { class: 'num', text: r.mcap_usd === null ? 'n/a' : fmtUsd(r.mcap_usd) }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tbody.appendChild(tr);
      });
    } else {
      rows.forEach(function (r) {
        var tr = el('tr', { onclick: function () { openDrawer(r.slug); } });
        tr.appendChild(el('td', { class: 'rank', text: String(r.rank) }));
        tr.appendChild(el('td', { class: 'name' }, el('b', { text: r.name }), el('div', { class: 'cat', text: (r.category || 'uncategorized') })));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { html: fmtPct(r.change_7d) }));
        tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
        var ratio = DATA.rows.length && r.implied_value_usd / (DATA.rows[0].implied_value_usd || 1);
        var bar = el('div', { class: 'barwrap' }, el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(3, Math.round((ratio || 0) * 100)) + '%' })), el('span', { class: 'v', text: fmtUsd(r.implied_value_usd) }));
        var td = el('td');
        td.appendChild(bar);
        tr.appendChild(td);
        var wltd = el('td');
        wltd.appendChild(el('span', { class: r.on_watchlist ? 'wl' : 'nt', text: r.on_watchlist ? 'watchlist' : 'early' }));
        tr.appendChild(wltd);
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderDrawer(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return null;
    var d = el('div', { class: 'drawer' });
    d.appendChild(el('button', { class: 'close', text: '×', onclick: closeDrawer }));
    d.appendChild(el('div', { class: 'tag' }, el('span', { class: 'wl', text: r.on_watchlist ? 'HOUSE WATCHLIST' : 'EARLY RADAR' }), el('span', { class: 'chip', text: 'rank ' + r.rank })));
    d.appendChild(el('h2', { text: r.name }));
    d.appendChild(el('div', { class: 'tags' }, chips(r.chains, 6), el('span', { class: 'chip', text: r.category || 'uncategorized' })));
    d.appendChild(el('div', { class: 'grid' },
      el('b', { text: 'TVL' }), el('span', { text: fmtUsd(r.tvl_usd) }),
      el('b', { text: '7d change' }), el('span', { html: fmtPct(r.change_7d) }),
      el('b', { text: 'listed' }), el('span', { text: r.listed_at || 'not recorded' }),
      el('b', { text: 'age' }), el('span', { text: fmtAge(r.age_days) }),
      el('b', { text: 'implied value' }), el('span', { html: '<b>' + fmtUsd(r.implied_value_usd) + '</b>' })));
    var recomputed = impliedOf(r);
    d.appendChild(el('h3', { text: 'The model, recomputed from the snapshot' }));
    d.appendChild(el('div', { class: 'factors' },
      el('div', { html: 'base = <span class="f">' + fmtUsd(r.tvl_usd) + '</span> × ' + M.launch_multiple + ' = <span class="f">' + fmtUsd(Math.round(r.tvl_usd * M.launch_multiple)) + '</span>' }),
      el('div', { html: 'growth ×<span class="f">' + r.growth_multiplier + '</span> (7d ' + (r.change_7d === null ? 'unreported → 0' : (r.change_7d > 0 ? '+' : '') + r.change_7d + '%') + ')' }),
      el('div', { html: 'age ×<span class="f">' + r.age_multiplier + '</span> (' + (r.age_days === null ? 'no listing date → ' + M.unknown_age_days + 'd assumed' : fmtAge(r.age_days) + ' without a token') + ')' }),
      el('div', { html: 'board.json carries <span class="f">' + fmtUsd(r.implied_value_usd) + '</span>; this page recomputes <span class="f">' + fmtUsd(recomputed) + '</span> — ' + (recomputed === r.implied_value_usd ? 'the same number' : 'DIFFERENT, a rounding fault') })));
    d.appendChild(el('h3', { text: 'How to farm it before a token' }));
    var steps = el('div', { class: 'steps' });
    (r.farm_steps || []).forEach(function (s) {
      var m = s.match(/^(.*) Cost: (.*?)\. Time: (.*?)\.$/s);
      var text = m ? m[1] : s;
      var cost = m ? m[2] : 'see the protocol';
      var time = m ? m[3] : 'varies';
      var step = el('div', { class: 'step' }, el('span', { text: text }));
      step.appendChild(el('div', { class: 'badges' }, el('span', { text: cost }), el('span', { text: time })));
      steps.appendChild(step);
    });
    d.appendChild(steps);
    d.appendChild(el('p', { class: 'note', text: 'A protocol on this list may still have a token its DefiLlama record does not carry; always check the protocol\'s own page before farming.' }));
    return d;
  }

  function openDrawer(slug) {
    state.selected = slug;
    var old = document.querySelector('.drawer');
    if (old) old.remove();
    var d = renderDrawer(slug);
    if (d) document.body.appendChild(d);
    history.replaceState(null, '', '#row/' + encodeURIComponent(slug));
  }
  function closeDrawer() {
    state.selected = null;
    var old = document.querySelector('.drawer');
    if (old) old.remove();
    history.replaceState(null, '', location.pathname);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  function render() {
    renderTop();
    app.innerHTML = '';
    var shell = el('div', { class: 'shell' });
    var head = el('div', { class: 'headline' },
      el('div', {},
        el('h1', { text: 'Every protocol still running without a token, ranked by what a launch would be worth' }),
        el('p', { class: 'sub', text: 'The house watchlist is the floor, never the ceiling: all ' + DATA.watchlist_size + ' of its pre-token protocols are ranked here, plus ' + DATA.early_size + ' early ones the radar found below the floor. Implied value is this radar\'s own model, not a promise.' }),
        renderModel()),
      el('div', { class: 'stats' },
        el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'watchlist covered' }),
        el('b', { text: String(DATA.board_size) }), el('span', { text: 'pre-token rows ranked' }),
        el('b', { text: String(DATA.early_size) }), el('span', { text: 'early rows below the floor' }),
        el('b', { text: String(DATA.live_size) }), el('span', { text: 'live-token protocols set aside' })));
    shell.appendChild(head);
    shell.appendChild(renderControls());
    shell.appendChild(renderTable());
    shell.appendChild(el('p', { class: 'note', text: 'DefiLlama records no token for the protocols ranked here — that is DefiLlama\'s record, not proof none exists. Implied value is the radar\'s own model of what a launch would be worth if each record stayed as it is.' }));
    app.appendChild(shell);
    if (state.selected) {
      var d = renderDrawer(state.selected);
      if (d) document.body.appendChild(d);
    }
  }

  window.addEventListener('hashchange', function () { applyHash(location.hash); render(); });
  render();
})();
