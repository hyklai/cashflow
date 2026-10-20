import { createBackend, DEMO, sessionStore } from './backend.js';
import { watchGame, STATUS_TEXT } from './game.js';
import {
  applyOrder, normPlayer, unitPrice, holdingValue, holdingEnd, rank, RANKINGS, r2,
} from './engine.js';
import { TAG_LABELS } from './catalog.js';
import { cfdSVG, flowTable } from './cfd.js';
import { $, $$, esc, money, pct, slug, cleanName, pinHash, fmtClock, toast } from './util.js';

const SKEY = 'eegame-student';
let B;            // backend
let S = null;     // live game state
let me = null;    // { code, pid, pin, name }
let draft = null; // { round, buys: {id: n}, mode: 'all'|'amount', amount }
let marketKey = '';
let timerInt = null;
let currentTab = 'market';

boot().catch((e) => { console.error(e); showJoin('', `Could not connect: ${e.message || e}`); });

async function boot() {
  if (DEMO) $('#demo').classList.remove('hidden');
  B = await createBackend();
  await B.signInAnon();
  const g = (new URLSearchParams(location.search).get('g') || '').toUpperCase();
  const saved = readSession();
  if (saved && (!g || g === saved.code)) {
    const err = await tryEnter(saved);
    if (!err) return;
    showJoin(saved.code, err, saved);
    return;
  }
  showJoin(g);
}

function readSession() {
  try { return JSON.parse(sessionStore.getItem(SKEY)); } catch { return null; }
}

// ---------------------------------------------------------------- joining

function showJoin(code = '', err = '', saved = null) {
  if (S) { S.stop(); S = null; }
  $('#loading').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#join').classList.remove('hidden');
  $('#jCode').value = code || '';
  if (saved) $('#jName').value = saved.name || '';
  $('#joinErr').textContent = err;
  (code ? (saved ? $('#jPin') : $('#jName')) : $('#jCode')).focus();
}

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#jCode').value.trim().toUpperCase();
  const name = cleanName($('#jName').value);
  const pin = $('#jPin').value.trim();
  const err = $('#joinErr');
  if (!/^[A-Z0-9]{4,6}$/.test(code)) return (err.textContent = 'Enter the game code shown on the big screen.');
  if (!slug(name)) return (err.textContent = 'Enter a name using letters or numbers.');
  if (!/^\d{4}$/.test(pin)) return (err.textContent = 'Your PIN must be exactly 4 digits.');
  err.textContent = '';
  const btn = e.submitter || $('#joinForm button');
  btn.disabled = true;
  try {
    const msg = await tryEnter({ code, name, pid: slug(name), pin });
    if (msg) err.textContent = msg;
  } finally { btn.disabled = false; }
});

// Returns an error message, or '' after entering the game.
async function tryEnter(sess) {
  const meta = await B.get(`games/${sess.code}/meta`).catch(() => null);
  if (!meta) return `There is no game with code ${sess.code}. Check the big screen.`;
  const hash = await pinHash(sess.code, sess.pid, sess.pin);
  const res = await B.claimJoin(sess.code, sess.pid, { name: sess.name, pinHash: hash, uid: B.uid, ts: B.now() });
  if (res !== 'ok') {
    return meta.allowJoin === false
      ? 'Joining is closed, or that name is taken and the PIN does not match. Ask your teacher.'
      : `"${sess.name}" is already playing with a different PIN. If that's you, check your PIN. If not, add your last initial.`;
  }
  me = sess;
  sessionStore.setItem(SKEY, JSON.stringify(sess));
  enterGame();
  return '';
}

function enterGame() {
  $('#loading').classList.add('hidden');
  $('#join').classList.add('hidden');
  $('#app').classList.remove('hidden');
  marketKey = '';
  if (S) S.stop();
  S = watchGame(B, me.code, [
    'meta', 'catalog', 'players',
    ['myOrder', `games/${me.code}/orders/${me.pid}`],
    ['myJoin', `games/${me.code}/joins/${me.pid}`],
  ], render);
  B.setPresence(`games/${me.code}/presence/${me.pid}`, { t: B.now() });
}

// ---------------------------------------------------------------- rendering

function render() {
  if (!S || !S.loaded.has('meta') || !S.loaded.has('players') || !S.loaded.has('myJoin')) return;
  const m = S.meta;
  if (!m) return showJoin(me.code, 'This game has been deleted.');

  // Someone else signed in with this name, or the teacher removed this player.
  const joinLost = S.errors?.myJoin || (S.myJoin && S.myJoin.uid !== B.uid) || (!S.myJoin);
  if (joinLost) {
    if (!S.players[me.pid]) {
      sessionStore.removeItem(SKEY);
      return showJoin(me.code, 'You were removed from this game. Join again or ask your teacher.');
    }
    return renderTakenOver();
  }

  const p = S.players[me.pid] ? normPlayer(S.players[me.pid]) : null;
  $('#tbName').textContent = me.name;
  $('#tbYear').textContent = m.status === 'lobby' ? '' : `Year ${m.year} of ${m.settings.years}`;
  const st = $('#tbStatus');
  st.textContent = STATUS_TEXT[m.status] || m.status;
  st.className = `pill${m.status === 'open' ? ' pill-open' : ''}`;
  runTimer();

  if (!p) {
    $('#tab-market').innerHTML = `<div class="sheet"><h2>Setting up your account…</h2>
      <p class="soft">Your teacher's screen adds you to the game. This takes a moment.</p></div>`;
    $('#planBar').classList.add('hidden');
    return;
  }
  renderNews(m, p);
  renderMarket(m, p);
  renderPortfolio(m, p);
  renderRank(m);
}

function renderNews(m, p) {
  const e = m.lastEvent;
  const el = $('#news');
  const fresh = e && e.year === m.year && m.status !== 'ended';
  const mine = p?.eventReport && p.eventReport.year === m.year ? Object.values(p.eventReport.lines || {}) : [];
  el.classList.toggle('hidden', !fresh && !mine.length);
  el.innerHTML = `${fresh ? `<b>News: ${esc(e.title)}</b> <span>${esc(e.detail || '')}</span>` : ''}
    ${mine.length ? `<p class="news-mine">What it meant for you:</p>${linesHtml(mine)}` : ''}`;
}

function renderTakenOver() {
  $('#planBar').classList.add('hidden');
  $('#tab-market').innerHTML = `<div class="sheet"><h2>Signed in somewhere else</h2>
    <p>Your name is now being used on another device. Only one device can play at a time.</p>
    <button id="takeBack" class="btn-mark btn-block">Use this device instead</button></div>`;
  showTab('market');
  $('#takeBack').onclick = async () => {
    const err = await tryEnter(me);
    if (err) showJoin(me.code, err, me);
  };
}

function runTimer() {
  const el = $('#tbTimer');
  clearInterval(timerInt);
  const dl = S.meta.deadline;
  if (!dl || S.meta.status !== 'open') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const tick = () => {
    const left = dl - B.now();
    el.textContent = left > 0 ? fmtClock(left) : 'Time!';
    el.classList.toggle('late', left <= 30000);
  };
  tick();
  timerInt = setInterval(tick, 500);
}

// ---------- market tab

function defaultDraft(m, p) {
  const o = S.myOrder;
  if (o && o.round === m.year) {
    return {
      round: m.year,
      buys: { ...(o.buys || {}) },
      mode: o.savingsAll ? 'all' : 'amount',
      amount: o.savingsAll ? 0 : Number(o.savingsTarget) || 0,
    };
  }
  // Default plan = leave things as they are.
  return { round: m.year, buys: {}, mode: p.cash < 1 ? 'all' : 'amount', amount: r2(p.savings) };
}

function draftOrder() {
  const buys = {};
  for (const [id, n] of Object.entries(draft.buys)) if (n > 0) buys[id] = n;
  return {
    round: draft.round,
    buys,
    savingsAll: draft.mode === 'all',
    savingsTarget: draft.mode === 'amount' ? Math.max(0, Number(draft.amount) || 0) : 0,
  };
}

const sameOrder = (a, b) => {
  if (!a || !b) return false;
  const norm = (o) => JSON.stringify({
    round: o.round, buys: Object.fromEntries(Object.entries(o.buys || {}).filter(([, n]) => n > 0).sort()),
    savingsAll: !!o.savingsAll, savingsTarget: o.savingsAll ? 0 : Number(o.savingsTarget) || 0,
  });
  return norm(a) === norm(b);
};

function renderMarket(m, p) {
  const el = $('#tab-market');
  const bar = $('#planBar');
  if (m.status !== 'open') {
    marketKey = '';
    bar.classList.add('hidden');
    el.innerHTML = marketClosedHtml(m, p);
    return;
  }
  const key = [m.year, m.offerIds.join(','), m.settings.bankRate, Object.keys(S.catalog).length].join('|');
  if (key !== marketKey || !draft || draft.round !== m.year) {
    marketKey = key;
    draft = defaultDraft(m, p);
    el.innerHTML = marketHtml(m);
    wireMarket(m);
  }
  bar.classList.remove('hidden');
  updatePlan();
}

function marketHtml(m) {
  const offers = m.offerIds.map((id) => S.catalog[id]).filter(Boolean);
  const rate = m.settings.bankRate;
  return `
    <div class="intro">
      <h2>Year ${m.year} market</h2>
      <p class="soft">Choose what to buy. Diagrams show the cash flows for <b>one share</b>, at the end of each year after you buy.
      The bank pays <b>${pct(rate)}</b> a year on savings, compounded yearly. Cash pays nothing.</p>
    </div>
    ${offers.map((o) => offerCard(o)).join('')}
    <div class="sheet savings-card">
      <h3>Bank savings · ${pct(rate)} a year</h3>
      <p class="soft">After buying, what should happen to your leftover money? You can withdraw savings any year.</p>
      <div class="seg" role="radiogroup" aria-label="Savings choice">
        <button type="button" role="radio" data-mode="all">Save all of it</button>
        <button type="button" role="radio" data-mode="amount">Save an amount</button>
      </div>
      <div class="field amount-field">
        <label for="savAmt">Amount to keep in savings</label>
        <input id="savAmt" type="number" min="0" step="100" inputmode="decimal">
        <p class="hint">The rest stays as cash. Use 0 to keep everything as cash.</p>
      </div>
    </div>`;
}

function offerCard(o) {
  const price = unitPrice(o);
  return `
    <article class="sheet offer" data-id="${esc(o.id)}">
      <div class="spread offer-head">
        <div>
          <h3>${esc(o.name)}</h3>
          <span class="tag">${esc(TAG_LABELS[o.tag] || o.tag || '')}</span>
        </div>
        <div class="price"><span class="num">${money(price)}</span><small>per share</small></div>
      </div>
      <p class="blurb">${esc(o.blurb || '')}</p>
      <div class="cfd-wrap">${cfdSVG(o.flows, { title: `${o.name} cash flows per share` })}</div>
      <details><summary>Show as a table</summary>${flowTable(o.flows)}</details>
      <div class="stepper" aria-label="Shares of ${esc(o.name)}">
        <button type="button" class="minus" aria-label="One fewer share">−</button>
        <output class="qty num">0</output>
        <button type="button" class="plus" aria-label="One more share">+</button>
        <span class="cost soft num"></span>
      </div>
    </article>`;
}

function wireMarket(m) {
  for (const card of $$('.offer')) {
    const id = card.dataset.id;
    card.querySelector('.minus').onclick = () => { draft.buys[id] = Math.max(0, (draft.buys[id] || 0) - 1); updatePlan(); };
    card.querySelector('.plus').onclick = () => { draft.buys[id] = (draft.buys[id] || 0) + 1; updatePlan(); };
  }
  for (const b of $$('.seg button')) b.onclick = () => { draft.mode = b.dataset.mode; updatePlan(); };
  const amt = $('#savAmt');
  amt.value = draft.mode === 'amount' ? Math.round(draft.amount) : '';
  amt.oninput = () => { draft.amount = Number(amt.value) || 0; updatePlan(true); };
}

function updatePlan(fromInput = false) {
  const m = S.meta, p = normPlayer(S.players[me.pid]);
  const order = draftOrder();
  const res = applyOrder(p, order, S.catalog, m.offerIds, m.year).player;
  const liquid = r2(p.cash + p.savings - p.debt);
  let spend = 0;
  for (const card of $$('.offer')) {
    const id = card.dataset.id, o = S.catalog[id], n = draft.buys[id] || 0, price = unitPrice(o);
    spend += n * price;
    card.querySelector('.qty').textContent = n;
    card.querySelector('.cost').textContent = n ? `= ${money(n * price)}` : '';
    card.classList.toggle('chosen', n > 0);
  }
  const left = r2(liquid - spend);
  for (const card of $$('.offer')) {
    const price = unitPrice(S.catalog[card.dataset.id]);
    card.querySelector('.plus').disabled = left < price;
    card.querySelector('.minus').disabled = !(draft.buys[card.dataset.id] > 0);
  }
  for (const b of $$('.seg button')) b.setAttribute('aria-checked', String(b.dataset.mode === draft.mode));
  $('.amount-field').classList.toggle('hidden', draft.mode !== 'amount');
  if (!fromInput && draft.mode === 'amount') $('#savAmt').value = Math.round(draft.amount);

  const submitted = sameOrder(S.myOrder, order);
  const over = left < 0;
  $('#planBar').innerHTML = `
    <div class="plan-nums">
      <div><small>To use</small><span class="num">${money(liquid)}</span></div>
      <div><small>Buying</small><span class="num">${money(spend)}</span></div>
      <div><small>Savings</small><span class="num">${money(res.savings)}</span></div>
      <div><small>Cash</small><span class="num ${res.cash > 0 ? 'idle' : ''}">${money(res.cash)}</span></div>
    </div>
    <div class="plan-act">
      <span class="plan-state ${submitted ? 'ok' : ''}">${over ? 'Not enough money for this plan'
        : submitted ? '✓ Plan submitted. You can still change it.' : 'Plan not submitted yet'}</span>
      <button id="submitPlan" class="btn-mark" ${over || submitted ? 'disabled' : ''}>${submitted ? 'Submitted' : 'Submit plan'}</button>
    </div>`;
  $('#submitPlan').onclick = submitPlan;
}

async function submitPlan() {
  const btn = $('#submitPlan');
  btn.disabled = true;
  try {
    await B.set(`games/${me.code}/orders/${me.pid}`, { ...draftOrder(), ts: B.now() });
    toast('Plan submitted');
  } catch (e) {
    toast(S.meta.status !== 'open' ? 'The market just closed.' : `Could not submit: ${e.message || e}`, 'error');
    btn.disabled = false;
  }
}

function linesHtml(lines) {
  if (!lines || !lines.length) return '<p class="soft">Nothing happened to your money.</p>';
  return `<ul class="lines">${Object.values(lines).map((l) => `
    <li><span>${esc(l.text)}</span><span class="num ${l.amt > 0 ? 'pos' : l.amt < 0 ? 'neg' : ''}">${
      l.amt ? money(l.amt, { sign: true, cents: true }) : l.note ? money(l.note, { cents: true }) : ''}</span></li>`).join('')}</ul>`;
}

function marketClosedHtml(m, p) {
  const n = Object.keys(S.players).length;
  const place = rank(S.players, 'nw').find((x) => x.pid === me.pid)?.place;
  if (m.status === 'lobby') {
    return `<div class="sheet"><h2>You're in, ${esc(me.name)}</h2>
      <p>You start with <b>${money(p.cash)}</b>. When the teacher opens the market, you'll choose
      investments and decide how much to keep in the bank.</p>
      <p class="soft">Your goal: the highest net worth at the end of Year ${m.settings.years}.</p></div>`;
  }
  if (m.status === 'ended') {
    return `<div class="sheet final"><h2>Game over</h2>
      <p class="big num">${money(p.nw)}</p>
      <p>Final net worth: place <b>${place}</b> of ${n}.</p>
      <p class="soft">Investments still running were counted at their present worth at the ${pct(m.settings.bankRate)} bank rate.</p>
      ${p.report ? `<h3>Year ${p.report.year}</h3>${linesHtml(p.report.lines)}` : ''}</div>`;
  }
  if (m.status === 'closed') {
    const rep = p.orderReport && p.orderReport.year === m.year ? p.orderReport : null;
    return `<div class="sheet"><h2>Market closed</h2>
      <p class="soft">Look at the big screen. Here's what happened with your plan for Year ${m.year}:</p>
      ${rep ? linesHtml(rep.lines) : '<p>You did not submit a plan, so nothing changed.</p>'}
      ${summaryHtml(p)}</div>`;
  }
  // results
  const rep = p.report && p.report.year === m.year ? p.report : null;
  return `<div class="sheet"><h2>End of Year ${m.year}</h2>
    ${rep ? linesHtml(rep.lines) : '<p class="soft">No changes.</p>'}
    ${summaryHtml(p)}
    <p class="soft">The market for Year ${m.year} opens when your teacher is ready.</p></div>`;
}

function summaryHtml(p) {
  const showGain = S.meta.year > (p.joinedYear ?? 0);
  return `<dl class="summary">
    <div><dt>Net worth</dt><dd class="num">${money(p.nw)}</dd></div>
    <div><dt>Liquid capital</dt><dd class="num">${money(p.liq)}</dd></div>
    ${showGain ? `<div><dt>Change last year</dt><dd class="num ${p.gain > 0 ? 'pos' : p.gain < 0 ? 'neg' : ''}">${money(p.gain, { sign: true })}</dd></div>` : ''}
  </dl>`;
}

// ---------- portfolio tab

function renderPortfolio(m, p) {
  const T = m.year, rate = m.settings.bankRate;
  const hs = Object.values(p.holdings).sort((a, b) => a.year - b.year);
  const invVal = r2(p.nw - p.liq);
  $('#tab-portfolio').innerHTML = `
    <div class="sheet networth">
      <small>Net worth</small>
      <p class="big num">${money(p.nw)}</p>
      ${sparkline(p.history)}
      <dl class="breakdown">
        <div><dt>Cash (0%)</dt><dd class="num">${money(p.cash)}</dd></div>
        <div><dt>Savings (${pct(rate)})</dt><dd class="num">${money(p.savings)}</dd></div>
        ${p.debt > 0 ? `<div><dt>Overdraft debt (${pct(m.settings.overdraftRate)})</dt><dd class="num neg">${money(-p.debt)}</dd></div>` : ''}
        <div><dt>Investments</dt><dd class="num">${money(invVal)}</dd></div>
      </dl>
      <p class="hint">Investments count at their present worth: what their remaining payments are worth today at the ${pct(rate)} bank rate.</p>
    </div>
    <h2 class="section-title">Investments</h2>
    ${hs.length ? hs.map((h) => {
      const o = S.catalog[h.offerId];
      if (!o) return '';
      const val = holdingValue(o, h, T, rate, m.modifiers);
      return `<article class="sheet holding">
        <div class="spread"><h3>${esc(o.name)} × ${h.units}</h3><span class="num">${money(val)}</span></div>
        <p class="soft">Bought in Year ${h.year} for ${money(unitPrice(o) * h.units)}. Final payment at the end of Year ${holdingEnd(o, h)}.</p>
        ${cfdSVG(o.flows, { units: h.units, t0: h.year, now: T, title: `${o.name} cash flows` })}
      </article>`;
    }).join('') : '<p class="soft">No investments yet. Your money is all in cash and savings.</p>'}
    ${p.report ? `<h2 class="section-title">Year ${p.report.year} report</h2><div class="sheet">${linesHtml(p.report.lines)}</div>` : ''}`;
}

function sparkline(history) {
  const pts = Object.entries(history || {}).map(([y, v]) => [Number(y), v.nw]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return '';
  const W = 300, H = 60, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x) => 4 + ((x - x0) / (x1 - x0 || 1)) * (W - 8);
  const Y = (y) => H - 6 - ((y - y0) / (y1 - y0 || 1)) * (H - 12);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Net worth by year">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map((p) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="currentColor"/>`).join('')}</svg>`;
}

// ---------- ranking tab

function renderRank(m) {
  const by = m.rankBy || 'nw';
  const R = RANKINGS[by];
  const list = rank(S.players, by);
  const mine = list.find((x) => x.pid === me.pid);
  const fmt = (p) => R.fmt === 'count' ? `${p.div}` : money(R.key(p), { sign: R.fmt === 'signed' });
  const top = list.slice(0, 10);
  if (mine && !top.includes(mine)) top.push(mine);
  $('#tab-rank').innerHTML = `
    <div class="sheet">
      <h2>${esc(R.label)}</h2>
      <p class="soft">${esc(R.help)}. Your teacher picks the ranking.</p>
      ${mine ? `<p>You are <b>#${mine.place}</b> of ${list.length}.</p>` : ''}
      <ol class="ranklist">${top.map((p) => `
        <li class="${p.pid === me.pid ? 'me' : ''}"><span class="place">${p.place}</span>
        <span class="nm">${p.pid === me.pid ? `<span class="hl">${esc(p.name)}</span>` : esc(p.name)}</span>
        <span class="num">${fmt(p)}</span></li>`).join('')}</ol>
    </div>`;
}

// ---------- tabs

function showTab(t) {
  currentTab = t;
  for (const b of $$('.tabbar button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const s of $$('.tab')) s.classList.toggle('hidden', s.id !== `tab-${t}`);
  $('#planBar').classList.toggle('offtab', t !== 'market');
  window.scrollTo({ top: 0 });
}
for (const b of $$('.tabbar button')) b.onclick = () => showTab(b.dataset.tab);
