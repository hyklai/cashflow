// Teacher console. This window is the game's referee: it is the only place
// that changes balances (students only submit plans), so keep it open.

import { createBackend, DEMO } from './backend.js';
import { watchGame, STATUS_TEXT, joinUrl } from './game.js';
import {
  applyOrder, yearEnd, applyCash, revalue, normPlayer, offerMetrics, unitPrice,
  drawOffers, RANKINGS, r2,
} from './engine.js';
import { DEFAULT_OFFERS, DEFAULT_SETTINGS, EVENT_PRESETS, TAG_LABELS, resolveEvent } from './catalog.js';
import { $, $$, esc, money, pct, genCode, randomId, pinHash, fmtClock, toast } from './util.js';

let B, S = null, code = null;
const tabId = randomId(8);
const creating = new Set();
let busy = false;
let timerInt = null;

boot().catch((e) => { console.error(e); show('login'); $('#loginErr').textContent = `Could not connect: ${e.message || e}`; });

function show(id) {
  for (const s of ['loading', 'login', 'games', 'console']) $(`#${s}`).classList.toggle('hidden', s !== id);
}

async function boot() {
  if (DEMO) $('#demo').classList.remove('hidden');
  B = await createBackend();
  if (DEMO) await B.signInTeacher();
  if (!B.isTeacher) return show('login');
  afterSignIn();
}

function afterSignIn() {
  const g = new URLSearchParams(location.search).get('g');
  const last = localStorage.getItem('eegame-teacher-last');
  if (g) return openConsole(g.toUpperCase());
  showGames(last);
}

// ---------------------------------------------------------------- sign in

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const act = e.submitter?.dataset.act || 'in';
  const email = $('#lEmail').value.trim(), pw = $('#lPw').value;
  const err = $('#loginErr');
  if (!email || pw.length < 6) return (err.textContent = 'Enter your email and a password of at least 6 characters.');
  err.textContent = '';
  try {
    if (act === 'new') await B.createTeacher(email, pw); else await B.signInTeacher(email, pw);
    afterSignIn();
  } catch (x) {
    const c = String(x.code || x.message);
    err.textContent =
      c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') ? 'Email or password is wrong.'
      : c.includes('email-already-in-use') ? 'That email already has an account. Use Sign in.'
      : c.includes('operation-not-allowed') ? 'Email/password sign-in is not turned on in Firebase (README step 2).'
      : `Sign-in failed: ${c}`;
  }
});
$('#forgot').onclick = async (e) => {
  e.preventDefault();
  const email = $('#lEmail').value.trim();
  if (!email) return ($('#loginErr').textContent = 'Type your email first.');
  try { await B.resetPassword(email); toast('Password reset email sent.'); } catch (x) { $('#loginErr').textContent = x.message; }
};
$('#signOut').onclick = async () => { await B.signOut(); show('login'); };

// ---------------------------------------------------------------- game list

async function showGames() {
  if (S) { S.stop(); S = null; }
  code = null;
  show('games');
  const list = (await B.get(`teachers/${B.uid}/games`).catch(() => null)) || {};
  const items = Object.entries(list).sort((a, b) => b[1].createdAt - a[1].createdAt);
  const metas = await Promise.all(items.map(([c]) => B.get(`games/${c}/meta`).catch(() => null)));
  // Drop list entries whose game no longer exists.
  items.forEach(([c], i) => { if (!metas[i]) B.remove(`teachers/${B.uid}/games/${c}`).catch(() => {}); });
  const live = items.map((it, i) => [...it, metas[i]]).filter(([, , m]) => m);
  const statusLine = (m) => m.status === 'lobby' ? 'Not started'
    : m.status === 'ended' ? 'Finished' : `Year ${m.year} of ${m.settings?.years ?? '?'}`;
  $('#gameList').innerHTML = live.length
    ? live.map(([c, g, m]) => `<li class="game-row">
        <button class="btn-quiet open" data-code="${esc(c)}"><b>${esc(c)}</b> <span class="gt">${esc(g.title || '')}</span>
          <span class="soft">${statusLine(m)} · ${new Date(g.createdAt).toLocaleDateString()}</span></button>
        <button class="btn-danger btn-sm del" data-del="${esc(c)}" aria-label="Delete game ${esc(c)}">Delete</button></li>`).join('')
    : '<li class="soft">No saved games.</li>';
  for (const b of $$('#gameList [data-code]')) b.onclick = () => openConsole(b.dataset.code);
  for (const b of $$('#gameList [data-del]')) b.onclick = () => deleteGame(b.dataset.del);
}

async function deleteGame(c) {
  if (!confirm(`Delete game ${c}? Every student's money and history in it is erased. This cannot be undone.`)) return;
  if (code === c && S) { S.stop(); S = null; }
  try {
    await B.remove(`games/${c}`);
    await B.remove(`teachers/${B.uid}/games/${c}`);
    if (localStorage.getItem('eegame-teacher-last') === c) localStorage.removeItem('eegame-teacher-last');
    toast(`Game ${c} deleted.`);
  } catch (e) {
    toast(`Could not delete: ${e.message || e}. Did you publish the latest database.rules.json?`, 'error', 6000);
  }
  if (code === c) {
    history.replaceState(null, '', location.pathname + (DEMO ? '?demo=1' : ''));
  }
  showGames();
}

$('#newGame').addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {
    startCash: Math.max(100, Number($('#gCash').value) || DEFAULT_SETTINGS.startCash),
    years: Math.min(15, Math.max(2, Math.round(Number($('#gYears').value) || DEFAULT_SETTINGS.years))),
    bankRate: Math.max(0, Number($('#gRate').value) / 100),
    overdraftRate: Math.max(0, Number($('#gOd').value) / 100),
    withdrawPenalty: Math.min(0.25, Math.max(0, Number($('#gPen').value) / 100)),
    offersPerYear: Math.min(6, Math.max(2, Math.round(Number($('#gOffers').value) || DEFAULT_SETTINGS.offersPerYear))),
  };
  const title = $('#gTitle').value.trim().slice(0, 40);
  const catalog = Object.fromEntries(DEFAULT_OFFERS.map((o) => [o.id, o]));
  const now = B.now();
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = genCode(5);
    if (await B.get(`games/${c}/meta`).catch(() => null)) continue;
    try {
      await B.set(`games/${c}/meta`, {
        owner: B.uid, title, createdAt: now, status: 'lobby', year: 0, settings,
        allowJoin: true, rankBy: 'nw', view: 'auto', reveal: false, submitted: 0,
        nextOfferIds: drawOffers(catalog, { count: settings.offersPerYear, rate: settings.bankRate }), controller: tabId,
      });
    } catch { continue; }
    await B.set(`games/${c}/catalog`, catalog);
    await B.set(`teachers/${B.uid}/games/${c}`, { title, createdAt: now });
    return openConsole(c);
  }
  toast('Could not create a game code. Try again.', 'error');
});

// ---------------------------------------------------------------- console

function openConsole(c) {
  code = c;
  localStorage.setItem('eegame-teacher-last', c);
  const url = new URL(location.href); url.searchParams.set('g', c); history.replaceState(null, '', url);
  show('console');
  $('#cCode').textContent = c;
  const dUrl = new URL('display.html', location.href); dUrl.search = ''; dUrl.searchParams.set('g', c);
  if (DEMO) dUrl.searchParams.set('demo', '1');
  $('#displayLink').href = dUrl.toString();
  $('#studentLink').href = joinUrl(c);
  if (S) S.stop();
  S = watchGame(B, c, ['meta', 'catalog', 'players', 'joins', 'orders', 'presence'], onState);
  B.update(`games/${c}/meta`, { controller: tabId }).catch((e) => {
    toast(`You can't run this game: ${e.message || e}`, 'error');
    showGames();
  });
}
$('#backToGames').onclick = () => { history.replaceState(null, '', location.pathname + (DEMO ? '?demo=1' : '')); showGames(); };
$('#deleteGame').onclick = () => deleteGame(code);
$('#takeControl').onclick = () => B.update(`games/${code}/meta`, { controller: tabId });

const isController = () => S?.meta?.controller === tabId;

function onState() {
  if (!S.loaded.has('meta')) return;
  if (!S.meta) { toast('That game no longer exists.', 'error'); return showGames(); }
  if (S.meta.owner && S.meta.owner !== B.uid && !DEMO) { toast('That game belongs to another teacher.', 'error'); return showGames(); }
  $('#lockOverlay').classList.toggle('hidden', isController());
  if (isController()) housekeeping();
  render();
}

// Create player records for new joiners, and keep the "plans submitted" count current.
function housekeeping() {
  if (!S.loaded.has('players') || !S.loaded.has('joins')) return;
  const m = S.meta;
  const ups = {};
  for (const [pid, j] of Object.entries(S.joins || {})) {
    if (S.players[pid] || creating.has(pid)) continue;
    creating.add(pid);
    const cash = m.settings.startCash;
    ups[`players/${pid}`] = {
      name: j.name, cash, savings: 0, debt: 0, nw: cash, liq: cash, gain: 0, div: 0,
      joinedYear: m.year, history: { [m.year]: { nw: cash, liq: cash } },
    };
  }
  const submitted = Object.values(S.orders || {}).filter((o) => o && o.round === m.year).length;
  if (m.status === 'open' && submitted !== m.submitted) ups['meta/submitted'] = submitted;
  if (Object.keys(ups).length) {
    B.update(`games/${code}`, ups).catch((e) => toast(e.message, 'error')).finally(() => creating.clear());
  }
}

// ---------------------------------------------------------------- game steps

const STEP = {
  lobby: { label: () => 'Start game: open the Year 0 market', help: 'Students join with the code on the big screen. Year 0 offers are on the left.', run: openMarket },
  open: { label: () => 'Close the market', help: 'Carries out every submitted plan. Students can change plans until then.', run: closeMarket },
  closed: {
    label: (m) => (m.year + 1 >= m.settings.years ? `End Year ${m.year} and finish the game` : `End the year: move to Year ${m.year + 1}`),
    help: 'Pays a year of savings interest and every investment’s cash flow.', run: endYear,
  },
  results: { label: (m) => `Open the Year ${m.year} market`, help: 'The offers on the left were drawn at random. Swap any you like first.', run: openMarket },
  ended: { label: () => 'Game over', help: 'Download the results or start a new game.', run: null },
};

$('#stepBtn').onclick = async () => {
  if (busy || !isController()) return;
  const s = STEP[S.meta.status];
  if (!s?.run) return;
  if (S.meta.status === 'closed' && S.meta.year + 1 >= S.meta.settings.years &&
      !confirm('This is the last year. End the game and show final results?')) return;
  busy = true; $('#stepBtn').disabled = true;
  try { await s.run(); } catch (e) { console.error(e); toast(`Something went wrong: ${e.message || e}`, 'error'); }
  finally { busy = false; render(); }
};

const players = () => Object.fromEntries(Object.entries(S.players || {}).map(([k, v]) => [k, normPlayer(v)]));

async function openMarket() {
  const m = S.meta;
  const ids = m.nextOfferIds.filter((id) => S.catalog[id]);
  await B.update(`games/${code}/meta`, {
    status: 'open', offerIds: ids, submitted: 0, reveal: false, deadline: null, allowJoin: m.allowJoin !== false,
    [`offered/${m.year}`]: ids,
  });
}

async function closeMarket() {
  const m = S.meta, T = m.year;
  await B.update(`games/${code}/meta`, { status: 'closed', deadline: null });
  const orders = (await B.get(`games/${code}/orders`)) || {};
  const ups = {};
  for (const [pid, p0] of Object.entries(players())) {
    const o = orders[pid];
    let p = p0, orderReport = null;
    if (o && o.round === T) {
      const res = applyOrder(p0, o, S.catalog, m.offerIds, T, m.settings);
      p = res.player;
      orderReport = { year: T, lines: res.lines.length ? res.lines : [{ text: 'Plan carried out', amt: 0 }] };
    }
    revalue(p, S.catalog, T, m.settings.bankRate, m.modifiers);
    ups[`players/${pid}`] = { ...p, orderReport };
  }
  await B.update(`games/${code}`, ups);
}

async function endYear() {
  const m = S.meta, T = m.year, T1 = T + 1;
  const ups = {};
  for (const [pid, p0] of Object.entries(players())) {
    const { player: p, lines } = yearEnd(p0, S.catalog, T, m.settings, m.modifiers);
    revalue(p, S.catalog, T1, m.settings.bankRate, m.modifiers);
    const before = p0.history?.[T]?.nw ?? p0.nw;
    p.gain = r2(p.nw - before);
    p.history = { ...p.history, [T1]: { nw: p.nw, liq: p.liq } };
    const news = p0.eventReport && p0.eventReport.year === T ? Object.values(p0.eventReport.lines || {}) : [];
    ups[`players/${pid}`] = { ...p, report: { year: T1, lines: [...news, ...lines] }, orderReport: null, eventReport: null };
  }
  const ended = T1 >= m.settings.years;
  ups['meta/year'] = T1;
  ups['meta/status'] = ended ? 'ended' : 'results';
  ups['meta/nextOfferIds'] = nextDraw(m);
  ups['meta/queued'] = null;
  ups['meta/reveal'] = false;
  ups['meta/submitted'] = 0;
  ups['meta/deadline'] = null;
  ups['orders'] = null;
  await B.update(`games/${code}`, ups);
}

function offeredBefore(m) {
  const ids = new Set();
  for (const list of Object.values(m.offered || {})) for (const id of Object.values(list || {})) ids.add(id);
  return ids;
}

// Teacher-added investments waiting for a market go first; the rest is random.
function nextDraw(m) {
  const count = m.settings.offersPerYear || DEFAULT_SETTINGS.offersPerYear;
  const queued = Object.values(m.queued || {}).filter((id) => S.catalog[id]);
  const used = offeredBefore(m);
  const pool = Object.fromEntries(Object.entries(S.catalog).filter(([id]) => !queued.includes(id)));
  const rest = drawOffers(pool, { count: Math.max(0, count - queued.length), exclude: [...used], rate: m.settings.bankRate });
  return [...queued, ...rest];
}

$('#endNow').onclick = async () => {
  if (!confirm('End the game now? Investments still running are counted at their present worth.')) return;
  await B.update(`games/${code}/meta`, { status: 'ended', deadline: null });
};

// ---------------------------------------------------------------- events

async function fireEvent(ev) {
  const m = S.meta, T = m.year;
  const id = `${T}_${randomId(5)}`;
  const ups = {};
  let rate = m.settings.bankRate;
  const mods = m.modifiers;
  if (ev.kind === 'rate') {
    rate = Math.max(0, r2((rate + ev.delta) * 10000) / 10000);
    ups['meta/settings/bankRate'] = rate;
  }
  let affected = 0;
  for (const [pid, p0] of Object.entries(players())) {
    let p = p0, lines = [];
    if (ev.kind === 'cash') ({ player: p, lines } = applyCash(p0, ev.amount, ev.title, m.settings));
    if (ev.kind === 'rate') lines = [{ text: `${ev.title}: bank rate is now ${pct(rate)}`, amt: 0 }];
    if (lines.length) {
      affected++;
      const prev = p.eventReport && p.eventReport.year === T ? Object.values(p.eventReport.lines || {}) : [];
      p.eventReport = { year: T, lines: [...prev, ...lines] };
    }
    revalue(p, S.catalog, T, rate, mods);
    ups[`players/${pid}`] = p;
  }
  const rec = { id, year: T, kind: ev.kind, title: ev.title, detail: ev.detail || '', ts: B.now(), affected };
  ups[`meta/events/${id}`] = rec;
  ups['meta/lastEvent'] = rec;
  await B.update(`games/${code}`, ups);
  toast(`Event fired: ${ev.title}`);
}

let presetsFor = '';
function renderPresets(settings) {
  const key = JSON.stringify([settings.startCash]);
  if (key === presetsFor) return;
  presetsFor = key;
  const evs = EVENT_PRESETS.map((e) => resolveEvent(e, settings));
  $('#presetList').innerHTML = evs.map((e) => `
    <button class="preset btn-quiet" data-id="${e.id}">
      <b>${esc(e.title)}</b><small>${esc(e.detail)}</small></button>`).join('');
  for (const b of $$('#presetList .preset')) {
    b.onclick = async () => {
      const ev = resolveEvent(EVENT_PRESETS.find((x) => x.id === b.dataset.id), S.meta.settings);
      if (!confirm(`Fire "${ev.title}" now?\n\n${ev.detail}`)) return;
      b.disabled = true;
      try { await fireEvent(ev); } finally { b.disabled = false; }
    };
  }
}
$('#coTag').innerHTML = Object.entries(TAG_LABELS).map(([t, l]) => `<option value="${t}">${esc(l)}</option>`).join('');
const kindSync = () => {
  const k = $('#ceKind').value;
  $('.ce-amount').classList.toggle('hidden', k !== 'cash');
  $('.ce-delta').classList.toggle('hidden', k !== 'rate');
};
$('#ceKind').onchange = kindSync;
kindSync();

$('#customEvent').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kind = $('#ceKind').value;
  const title = $('#ceTitle').value.trim();
  if (!title) return toast('Give the event a headline.', 'error');
  const ev = {
    kind, title, detail: $('#ceDetail').value.trim(),
    amount: Number($('#ceAmount').value) || 0,
    delta: (Number($('#ceDelta').value) || 0) / 100,
  };
  if (!confirm(`Fire "${title}" now?`)) return;
  await fireEvent(ev);
  $('#customEvent').reset(); $('#ceKind').dispatchEvent(new Event('change'));
});

// ---------------------------------------------------------------- custom offer

$('#customOffer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#coErr');
  const name = $('#coName').value.trim();
  const flows = $('#coFlows').value.split(/[,\s]+/).filter(Boolean).map(Number);
  if (!name) return (err.textContent = 'Give it a name.');
  if (flows.length < 2 || flows.length > 16 || flows.some((x) => !Number.isFinite(x))) return (err.textContent = 'Enter 2 to 16 numbers separated by commas.');
  if (!(flows[0] < 0)) return (err.textContent = 'Year 0 must be negative: it is the price of one share.');
  err.textContent = '';
  const id = `c_${randomId(6)}`;
  const m = S.meta;
  const editing = m.status === 'results' || m.status === 'lobby';
  await B.set(`games/${code}/catalog/${id}`, {
    id, name, tag: $('#coTag').value, blurb: $('#coBlurb').value.trim(), flows, custom: true,
  });
  if (editing) await B.update(`games/${code}/meta`, { nextOfferIds: [...m.nextOfferIds, id] });
  else await B.update(`games/${code}/meta`, { queued: [...Object.values(m.queued || {}), id] });
  $('#customOffer').reset();
  toast(`${name} will be in the Year ${editing ? m.year : m.year + 1} market.`);
});

// ---------------------------------------------------------------- controls

$('#rankBy').innerHTML = Object.entries(RANKINGS).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('');
$('#rankBy').onchange = (e) => B.update(`games/${code}/meta`, { rankBy: e.target.value });
$('#viewSel').onchange = (e) => B.update(`games/${code}/meta`, { view: e.target.value });
$('#allowJoin').onchange = (e) => B.update(`games/${code}/meta`, { allowJoin: e.target.checked });
for (const b of $$('.timer-row button')) {
  b.onclick = () => {
    const min = Number(b.dataset.min);
    B.update(`games/${code}/meta`, { deadline: min ? B.now() + min * 60000 : null });
  };
}

$('#csvBtn').onclick = () => {
  const m = S.meta;
  const years = Array.from({ length: m.year + 1 }, (_, i) => i);
  const rows = [['Name', 'Net worth', 'Liquid capital', 'Cash', 'Savings', 'Debt', 'Investments', 'Withdrawal penalties paid', ...years.map((y) => `Net worth Y${y}`)]];
  for (const p of Object.values(players()).sort((a, b) => b.nw - a.nw)) {
    rows.push([p.name, p.nw, p.liq, p.cash, p.savings, p.debt, Object.keys(p.holdings).length, p.penalties, ...years.map((y) => p.history?.[y]?.nw ?? '')]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `cash-flow-challenge-${code}-year${m.year}.csv`;
  a.click();
};

// ---------------------------------------------------------------- rendering

function render() {
  const m = S.meta;
  if (!m) return;
  $('#cYear').textContent = m.status === 'lobby' ? `${m.settings.years}-year game` : `Year ${m.year} of ${m.settings.years}`;
  const nPlayers = Object.keys(S.players || {}).length;
  $('#cStatus').textContent = `${STATUS_TEXT[m.status]}${m.status === 'open' ? ` · ${m.submitted || 0} of ${nPlayers} plans in` : ''}`;
  const step = STEP[m.status];
  $('#stepBtn').textContent = step.label(m);
  $('#stepBtn').disabled = busy || !step.run || !isController();
  $('#stepHelp').textContent = step.help;
  $('#rateNow').textContent = `Bank rate ${pct(m.settings.bankRate)}`;
  $('#rankBy').value = m.rankBy || 'nw';
  $('#viewSel').value = m.view || 'auto';
  $('#allowJoin').checked = m.allowJoin !== false;
  renderPresets(m.settings);
  renderOffers(m);
  renderRoster(m);
  renderLog(m);
  runTimer(m);
}

function runTimer(m) {
  clearInterval(timerInt);
  const el = $('#tLeft');
  if (!m.deadline) { el.textContent = ''; return; }
  const tick = () => { const l = m.deadline - B.now(); el.textContent = l > 0 ? fmtClock(l) : 'Time is up'; };
  tick(); timerInt = setInterval(tick, 500);
}

function keyRow(o, rate, { check = null, extra = '', note = '' } = {}) {
  const k = offerMetrics(o, rate);
  return `<tr class="${check === true ? 'on' : ''}">
    ${check != null ? `<td><input type="checkbox" data-id="${esc(o.id)}" ${check ? 'checked' : ''} aria-label="Offer ${esc(o.name)}"></td>` : ''}
    <td><b>${esc(o.name)}</b>${note ? ` <span class="tag">${esc(note)}</span>` : ''}</td>
    <td class="r num">${money(unitPrice(o))}</td>
    <td class="r num">${k.n} yr</td>
    <td class="r num ${k.pw >= 0 ? 'pos' : 'neg'}">${money(k.pw, { sign: true })}</td>
    <td class="r num ${k.aw >= 0 ? 'pos' : 'neg'}">${money(k.aw, { sign: true })}</td>
    <td class="r num">${k.irr == null ? '—' : pct(k.irr)}</td>
    ${extra}
  </tr>`;
}
const keyHead = (check, extra = '') => `<thead><tr>${check ? '<th></th>' : ''}<th>Investment</th><th class="r">Price</th><th class="r">Life</th>
  <th class="r">PW</th><th class="r">AW</th><th class="r">IRR</th>${extra}</tr></thead>`;

let swapOpen = false;
function renderOffers(m) {
  const editing = m.status === 'lobby' || m.status === 'results';
  const rate = m.settings.bankRate;
  $('#offersTitle').textContent = editing ? `Offers for the Year ${m.year} market` : `Year ${m.year} market`;
  $('#offersHelp').innerHTML = editing
    ? 'Drawn at random from investments not offered yet. Untick to remove one, or swap one in from the list below. Answer key at the current bank rate; students never see it unless you reveal it.'
    : `Answer key at ${pct(rate)}. ${m.status === 'closed' ? 'Show it on the big screen to discuss.' : ''}`;

  if (!editing) {
    const bought = {};
    for (const p of Object.values(S.players || {})) {
      for (const h of Object.values(p.holdings || {})) if (h.year === m.year) bought[h.offerId] = (bought[h.offerId] || 0) + h.units;
    }
    const queued = Object.values(m.queued || {}).map((id) => S.catalog[id]).filter(Boolean);
    $('#offerList').innerHTML = `
      <table class="key">${keyHead(false, '<th class="r">Bought</th>')}<tbody>${m.offerIds.map((id) => S.catalog[id])
        .filter(Boolean).map((o) => keyRow(o, rate, { extra: `<td class="r num">${bought[o.id] || 0}</td>` })).join('')}</tbody></table>
      <label class="check reveal"><input type="checkbox" id="revealBox" ${m.reveal ? 'checked' : ''} ${m.status === 'open' ? 'disabled' : ''}>
        Show PW, FW, AW and IRR on the big screen${m.status === 'open' ? ' (after the market closes)' : ''}</label>
      ${queued.length ? `<p class="hint">Added for next year: ${queued.map((o) => esc(o.name)).join(', ')}.</p>` : ''}`;
    $('#revealBox').onchange = (e) => B.update(`games/${code}/meta`, { reveal: e.target.checked });
    return;
  }

  const sel = m.nextOfferIds.filter((id) => S.catalog[id]);
  const usedIn = {};
  for (const [y, list] of Object.entries(m.offered || {})) for (const id of Object.values(list || {})) usedIn[id] = y;
  const others = Object.values(S.catalog).filter((o) => !sel.includes(o.id))
    .sort((a, b) => (a.id in usedIn) - (b.id in usedIn) || a.name.localeCompare(b.name));
  const count = m.settings.offersPerYear || DEFAULT_SETTINGS.offersPerYear;
  $('#offerList').innerHTML = `
    <table class="key">${keyHead(true)}<tbody>${sel.map((id) => keyRow(S.catalog[id], rate, { check: true })).join('')
      || `<tr><td colspan="7" class="soft">No offers picked. Draw some or swap some in below.</td></tr>`}</tbody></table>
    <div class="row offer-tools">
      <button id="redraw" class="btn-quiet btn-sm">Draw ${count} new offers</button>
      <span class="hint">${sel.length} offered. Unused investments left: ${others.filter((o) => !(o.id in usedIn)).length}</span>
    </div>
    <details class="swap" ${swapOpen ? 'open' : ''}>
      <summary>Swap in another investment</summary>
      <table class="key">${keyHead(true)}<tbody>${others.map((o) =>
        keyRow(o, rate, { check: false, note: o.id in usedIn ? `offered in Year ${usedIn[o.id]}` : '' })).join('')}</tbody></table>
    </details>`;
  $('details.swap').ontoggle = (e) => { swapOpen = e.target.open; };
  for (const cb of $$('#offerList input[data-id]')) {
    cb.onchange = () => {
      const id = cb.dataset.id;
      const next = cb.checked ? [...sel, id] : sel.filter((x) => x !== id);
      B.update(`games/${code}/meta`, { nextOfferIds: next });
    };
  }
  $('#redraw').onclick = () => {
    const used = offeredBefore(m);
    B.update(`games/${code}/meta`, {
      nextOfferIds: drawOffers(S.catalog, { count, exclude: [...used, ...sel], rate }),
    });
  };
}

function renderRoster(m) {
  const list = Object.entries(S.players || {}).map(([pid, p]) => ({ pid, ...normPlayer(p) })).sort((a, b) => b.nw - a.nw);
  $('#pCount').textContent = `(${list.length})`;
  const subm = new Set(Object.entries(S.orders || {}).filter(([, o]) => o && o.round === m.year).map(([pid]) => pid));
  $('#roster').innerHTML = list.length ? list.map((p) => `
    <tr>
      <td><span class="dot ${S.presence?.[p.pid] ? 'on' : ''}" title="${S.presence?.[p.pid] ? 'Connected' : 'Not connected'}"></span>${esc(p.name)}</td>
      <td class="r num">${money(p.nw)}</td>
      <td class="r num">${money(p.liq)}</td>
      <td>${m.status === 'open' ? (subm.has(p.pid) ? '<span class="pos">✓ In</span>' : '<span class="soft">Not yet</span>') : ''}</td>
      <td class="acts"><button class="btn-quiet btn-sm" data-pin="${esc(p.pid)}">New PIN</button>
        <button class="btn-quiet btn-sm" data-kick="${esc(p.pid)}" aria-label="Remove ${esc(p.name)}">Remove</button></td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="soft">No students yet. Open the big-screen display so they can see the code.</td></tr>`;
  for (const b of $$('[data-pin]')) {
    b.onclick = async () => {
      const pid = b.dataset.pin;
      const pin = prompt(`New 4-digit PIN for ${S.players[pid]?.name}:`);
      if (pin == null) return;
      if (!/^\d{4}$/.test(pin)) return toast('The PIN must be 4 digits.', 'error');
      await B.update(`games/${code}/joins/${pid}`, { pinHash: await pinHash(code, pid, pin) });
      toast(`PIN changed. ${S.players[pid]?.name} can now sign in with ${pin}.`);
    };
  }
  for (const b of $$('[data-kick]')) {
    b.onclick = async () => {
      const pid = b.dataset.kick;
      if (!confirm(`Remove ${S.players[pid]?.name} from the game? Their money is deleted.`)) return;
      await B.update(`games/${code}`, { [`joins/${pid}`]: null, [`players/${pid}`]: null, [`orders/${pid}`]: null, [`presence/${pid}`]: null });
    };
  }
}

function renderLog(m) {
  const evs = Object.values(m.events || {}).sort((a, b) => b.ts - a.ts);
  $('#eventLog').innerHTML = evs.length
    ? evs.map((e) => `<li><b>Year ${e.year}:</b> ${esc(e.title)} <span class="soft">${esc(e.detail)}</span></li>`).join('')
    : '<li class="soft">No events yet.</li>';
}
