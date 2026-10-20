// Big-screen display: read-only. Shows the join code, the market with
// cash-flow diagrams, the answer reveal, rankings, and event announcements.

import { createBackend } from './backend.js';
import { watchGame, STATUS_TEXT, joinUrl, eventsForYear } from './game.js';
import { rank, RANKINGS, offerMetrics, unitPrice, normPlayer } from './engine.js';
import { TAG_LABELS } from './catalog.js';
import { cfdSVG } from './cfd.js';
import { $, esc, money, pct, fmtClock } from './util.js';
import qrcode from '../vendor/qrcode.mjs';

let B, S, lastEventId = undefined, timerInt = null, overlayTimer = null, lastStage = '';

boot().catch((e) => { console.error(e); pick(`Could not connect: ${e.message || e}`); });

async function boot() {
  B = await createBackend();
  await B.signInAnon();
  const g = (new URLSearchParams(location.search).get('g') || '').toUpperCase();
  if (!g) return pick();
  start(g);
}

function pick(err = '') {
  $('#pick').classList.remove('hidden');
  $('#screen').classList.add('hidden');
  $('#pickErr').textContent = err;
}
$('#pickForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = $('#pCode').value.trim().toUpperCase();
  const u = new URL(location.href); u.searchParams.set('g', c); history.replaceState(null, '', u);
  start(c);
});

function start(code) {
  $('#pick').classList.add('hidden');
  $('#screen').classList.remove('hidden');
  const url = joinUrl(code);
  $('#dUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  $('#dCode').textContent = code;
  S = watchGame(B, code, ['meta', 'catalog', 'players', 'presence'], render);
}

function render() {
  if (!S.loaded.has('meta')) return;
  const m = S.meta;
  if (!m) return pick(`There is no game with code ${S.code}.`);
  document.title = `${S.code} · Cash Flow Challenge`;
  $('#dYear').textContent = m.status === 'lobby' ? `${m.settings.years}-year game` : `Year ${m.year} of ${m.settings.years}`;
  $('#dPhase').textContent = STATUS_TEXT[m.status];
  $('#dPhase').classList.toggle('open', m.status === 'open');
  $('#dRate').textContent = `Bank rate ${pct(m.settings.bankRate)}`;
  runTimer(m);
  maybeAnnounce(m);

  const view = m.status === 'lobby' ? 'lobby'
    : m.status === 'ended' ? (m.view === 'top5' ? 'top5' : 'final')
    : m.view && m.view !== 'auto' ? m.view
    : m.status === 'open' || m.status === 'closed' ? 'market' : 'top5';
  const html = view === 'lobby' ? lobby(m)
    : view === 'final' ? finalBoard(m)
    : view === 'market' ? market(m)
    : view === 'top5' ? top5(m)
    : board(m);
  if (html !== lastStage) { $('#stage').innerHTML = html; lastStage = html; }
}

function runTimer(m) {
  clearInterval(timerInt);
  const el = $('#dTimer');
  if (!m.deadline || m.status !== 'open') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const tick = () => {
    const l = m.deadline - B.now();
    el.textContent = l > 0 ? fmtClock(l) : 'Time is up';
    el.classList.toggle('late', l <= 30000);
  };
  tick(); timerInt = setInterval(tick, 500);
}

// ---------- event announcement (only for events fired while the screen is open)
function maybeAnnounce(m) {
  const e = m.lastEvent;
  const id = e?.id || null;
  if (lastEventId === undefined) { lastEventId = id; return; }
  if (id === lastEventId) return;
  lastEventId = id;
  if (!e) return;
  const ov = $('#eventOverlay');
  ov.innerHTML = `<div class="event-card"><p class="event-kicker">Breaking news · Year ${e.year}</p>
    <h1>${esc(e.title)}</h1><p>${esc(e.detail)}</p></div>`;
  ov.classList.remove('hidden');
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => ov.classList.add('hidden'), 12000);
}
$('#eventOverlay').onclick = () => $('#eventOverlay').classList.add('hidden');

// ---------- lobby
function lobby(m) {
  const url = joinUrl(S.code);
  const q = qrcode(0, 'M');
  q.addData(url); q.make();
  const names = Object.values(S.players || {}).map((p) => p.name).sort((a, b) => a.localeCompare(b));
  return `<section class="lobby">
    <div class="join-card sheet">
      <div class="qr">${q.createSvgTag({ cellSize: 8, margin: 2, scalable: true })}</div>
      <div>
        <p class="lead">Scan the code, or go to</p>
        <p class="url">${esc(url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''))}</p>
        <p class="lead">and enter</p>
        <p class="bigcode">${esc(S.code)}</p>
        <p class="soft">Pick a 4-digit PIN you'll remember. Everyone starts with ${money(m.settings.startCash)}.</p>
      </div>
    </div>
    <div class="joined">
      <h2>${names.length} joined</h2>
      <ul class="chips">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>
  </section>`;
}

// ---------- market
function market(m) {
  const rate = m.settings.bankRate;
  const offers = m.offerIds.map((id) => S.catalog[id]).filter(Boolean);
  const reveal = m.reveal && m.status !== 'open';
  const bought = {};
  for (const p of Object.values(S.players || {})) {
    for (const h of Object.values(p.holdings || {})) if (h.year === m.year) bought[h.offerId] = (bought[h.offerId] || 0) + h.units;
  }
  const nPlayers = Object.keys(S.players || {}).length;
  const cards = offers.map((o) => {
    const k = offerMetrics(o, rate);
    return `<article class="sheet dcard ${reveal ? (k.pw >= 0 ? 'good' : 'bad') : ''}">
      <div class="spread"><div><h2>${esc(o.name)}</h2><span class="tag">${esc(TAG_LABELS[o.tag] || '')}</span></div>
        <div class="dprice">${money(unitPrice(o))}<small>per share</small></div></div>
      <p class="dblurb">${esc(o.blurb || '')}</p>
      ${cfdSVG(o.flows, { width: 470, height: 190, big: true, title: `${o.name} cash flows` })}
      ${reveal ? `<dl class="metrics">
          <div><dt>PW</dt><dd class="${k.pw >= 0 ? 'pos' : 'neg'}">${money(k.pw, { sign: true })}</dd></div>
          <div><dt>FW at year ${k.n}</dt><dd class="${k.fw >= 0 ? 'pos' : 'neg'}">${money(k.fw, { sign: true })}</dd></div>
          <div><dt>AW</dt><dd class="${k.aw >= 0 ? 'pos' : 'neg'}">${money(k.aw, { sign: true })}</dd></div>
          <div><dt>IRR</dt><dd>${k.irr == null ? '—' : pct(k.irr)}</dd></div>
        </dl>
        <p class="verdict">${k.pw >= 0 ? `Beats the ${pct(rate)} bank` : `Worse than leaving it in the bank`} · class bought ${bought[o.id] || 0}</p>` : ''}
    </article>`;
  }).join('');
  const side = m.status === 'open'
    ? `<div class="sheet progress"><p class="bignum">${m.submitted || 0}<span>/${nPlayers}</span></p><p>plans submitted</p>
        <p class="soft">The bank pays ${pct(rate)} a year, compounded yearly. Cash pays nothing.</p></div>`
    : reveal ? formulas(rate) : `<div class="sheet progress"><p class="bignum">Closed</p><p>Plans carried out. Which ones were good deals?</p></div>`;
  return `<section class="market-view">
    <div class="cards n${offers.length}">${cards}</div>
    <aside class="side">${side}${miniBoard(m)}${newsList(m)}</aside>
  </section>`;
}

function formulas(i) {
  return `<div class="sheet formulas"><h3>At i = ${pct(i)}</h3>
    <p>P = F / (1 + i)<sup>n</sup></p>
    <p>F = P (1 + i)<sup>n</sup></p>
    <p>P = A [(1 + i)<sup>n</sup> − 1] / [i (1 + i)<sup>n</sup>]</p>
    <p>A = P [i (1 + i)<sup>n</sup>] / [(1 + i)<sup>n</sup> − 1]</p>
    <p class="soft">PW &gt; 0 means the investment earns more than the bank.</p></div>`;
}

function miniBoard(m) {
  const list = rank(S.players, 'nw').slice(0, 6);
  if (!list.length) return '';
  return `<div class="sheet mini"><h3>Top net worth</h3><ol>${list.map((p) => `
    <li><span class="place">${p.place}</span><span>${p.place === 1 ? `<span class="hl">${esc(p.name)}</span>` : esc(p.name)}</span><span class="num">${money(p.nw)}</span></li>`).join('')}</ol></div>`;
}

function newsList(m) {
  // In the results view the year that just ended is the one people care about.
  const y = m.status === 'results' ? m.year - 1 : m.year;
  const evs = [...eventsForYear(m, y), ...(y !== m.year ? eventsForYear(m, m.year) : [])];
  if (!evs.length) return '';
  return `<div class="sheet news-list"><h3>${m.status === 'results' ? `News from Year ${y}` : 'News this year'}</h3>${evs.map((e) => `<p><b>${esc(e.title)}.</b> ${esc(e.detail)}</p>`).join('')}</div>`;
}

// ---------- top 5 in every category (names only, no values)
function top5(m) {
  const cols = Object.entries(RANKINGS).map(([key, R]) => {
    const list = rank(S.players, key).slice(0, 5);
    return `<section class="sheet t5col">
      <h2>${esc(R.label)}</h2>
      <p class="t5help">${esc(R.help.replace(/ \(.*\)$/, ''))}</p>
      ${list.length ? `<ol class="t5list">${list.map((p) => `
        <li class="${p.place === 1 ? 'first' : ''}"><span class="place">${p.place}</span>
          <span class="nm">${p.place === 1 ? `<span class="hl">${esc(p.name)}</span>` : esc(p.name)}</span></li>`).join('')}</ol>`
        : '<p class="soft">No players yet.</p>'}
    </section>`;
  }).join('');
  const title = m.status === 'ended' ? `Top 5 after ${m.year} years` : m.year > 0 ? `Top 5 after Year ${m.year - 1}` : 'Top 5';
  return `<section class="top5-view">
    <h1 class="t5title">${title}</h1>
    <div class="t5grid">${cols}</div>
    ${newsList(m) ? `<div class="t5news">${newsList(m)}</div>` : ''}
  </section>`;
}

// ---------- leaderboard
function board(m) {
  const by = m.rankBy || 'nw';
  const R = RANKINGS[by];
  const list = rank(S.players, by);
  const top = list.slice(0, 14);
  const vals = top.map((p) => (by === 'div' ? p.div : R.key(p)));
  // Bars start from a floor below the lowest score so small differences are visible.
  const hi = Math.max(...vals, 0), lo = Math.min(...vals);
  const floor = by === 'nw' || by === 'liq' ? Math.max(0, lo - Math.max(0.6 * (hi - lo), 0.05 * Math.abs(hi))) : 0;
  const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v - floor)));
  const fmt = (p) => (by === 'div' ? `${p.div} places` : money(R.key(p), { sign: R.fmt === 'signed' }));
  const rows = top.map((p, i) => {
    const v = vals[i];
    const w = Math.max(2, (Math.abs(v - floor) / max) * 100);
    return `<li class="${p.place === 1 ? 'first' : ''}">
      <span class="place">${p.place}</span>
      <span class="nm">${esc(p.name)}</span>
      <span class="track"><span class="bar ${v < 0 ? 'negbar' : ''}" style="width:${w.toFixed(1)}%"></span></span>
      <span class="val num">${fmt(p)}</span>
      ${by !== 'gain' ? `<span class="chg num ${p.gain > 0 ? 'pos' : p.gain < 0 ? 'neg' : 'soft'}">${money(p.gain, { sign: true })}</span>` : '<span></span>'}
    </li>`;
  }).join('');
  return `<section class="board-view">
    <div class="board sheet">
      <div class="spread board-head"><h1>${esc(R.label)}</h1><p class="soft">${esc(R.help)}</p></div>
      ${list.length ? `<ol class="bars">${rows}</ol>` : '<p class="soft">No players yet.</p>'}
      ${list.length > top.length ? `<p class="soft">+ ${list.length - top.length} more</p>` : ''}
    </div>
    <aside class="side">${yearStats(m)}${newsList(m)}</aside>
  </section>`;
}

function yearStats(m) {
  const ps = Object.values(S.players || {}).map(normPlayer);
  if (!ps.length) return '';
  const avg = ps.reduce((s, p) => s + p.nw, 0) / ps.length;
  const best = [...ps].sort((a, b) => b.gain - a.gain)[0];
  const inDebt = ps.filter((p) => p.debt > 0).length;
  const idle = ps.reduce((s, p) => s + p.cash, 0);
  return `<div class="sheet stats"><h3>Class this year</h3>
    <dl>
      <div><dt>Average net worth</dt><dd class="num">${money(avg)}</dd></div>
      <div><dt>Biggest gain last year</dt><dd>${esc(best.name)} <span class="num ${best.gain > 0 ? 'pos' : best.gain < 0 ? 'neg' : ''}">${money(best.gain, { sign: true })}</span></dd></div>
      <div><dt>Cash earning 0%</dt><dd class="num">${money(idle)}</dd></div>
      ${inDebt ? `<div><dt>Students in overdraft</dt><dd class="num neg">${inDebt}</dd></div>` : ''}
    </dl></div>`;
}

// ---------- final
function finalBoard(m) {
  const list = rank(S.players, 'nw');
  const pod = list.slice(0, 3);
  const order = [pod[1], pod[0], pod[2]].filter(Boolean);
  return `<section class="final-view">
    <h1 class="final-title">Final net worth after ${m.year} years</h1>
    <div class="podium">${order.map((p) => `
      <div class="step p${p.place}"><p class="pname">${esc(p.name)}</p><p class="num">${money(p.nw)}</p><div class="block">${p.place}</div></div>`).join('')}</div>
    <ol class="final-list">${list.slice(3, 23).map((p) => `<li><span class="place">${p.place}</span><span>${esc(p.name)}</span><span class="num">${money(p.nw)}</span></li>`).join('')}</ol>
    <p class="soft center">Investments still running were counted at their present worth at the ${pct(m.settings.bankRate)} bank rate.
      Started with ${money(m.settings.startCash)}.</p>
  </section>`;
}
