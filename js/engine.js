// Game engine: pure functions, no database or DOM. The teacher console is the
// only place that runs state changes (students only submit plans), so a
// student cannot edit their own balance. Students use the same functions to
// preview the effect of their plan before submitting.
//
// Timing convention (end-of-year, as in the textbook):
//   - The market for "Year T" is open at time T. Purchases are paid at time T.
//   - "End year" moves the clock from T to T+1: savings earn interest for the
//     year, and every investment pays its cash flow for time T+1.

import { toArr } from './util.js';

export const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- textbook metrics (used for the teacher answer key and the reveal)

export function pw(flows, i) {
  return flows.reduce((s, f, k) => s + f / Math.pow(1 + i, k), 0);
}
export function fw(flows, i) {
  const n = flows.length - 1;
  return pw(flows, i) * Math.pow(1 + i, n);
}
export function aw(flows, i) {
  const n = flows.length - 1;
  if (n <= 0) return 0;
  if (Math.abs(i) < 1e-12) return pw(flows, i) / n;
  const g = Math.pow(1 + i, n);
  return (pw(flows, i) * (i * g)) / (g - 1);
}
// Internal rate of return by bisection (null when there is no sign change).
export function irr(flows) {
  // Scan outward from 0% for the first sign change (handles flows that turn
  // negative again at the end, which can have a second, meaningless root).
  let lo = null, hi = null;
  const grid = [];
  for (let r = 0; r <= 2; r += 0.01) grid.push(r);
  for (let r = -0.01; r >= -0.9; r -= 0.01) grid.push(r);
  for (const r of grid) {
    const a = r >= 0 ? r : r + 0.01, b = r >= 0 ? r + 0.01 : r;
    if (Math.abs(pw(flows, a)) < 1e-9) return a;
    if (pw(flows, a) * pw(flows, b) < 0) { lo = Math.min(a, b); hi = Math.max(a, b); break; }
  }
  if (lo == null) return null;
  let flo = pw(flows, lo);
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, fm = pw(flows, mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
export function offerMetrics(offer, i) {
  const f = toArr(offer.flows);
  return { pw: pw(f, i), fw: fw(f, i), aw: aw(f, i), irr: irr(f), n: f.length - 1, price: -f[0] };
}

// ---------- normalisation of data coming back from the database

export function normOffer(o) {
  return { ...o, flows: toArr(o.flows), years: toArr(o.years) };
}
export function normCatalog(c) {
  const out = {};
  for (const [id, o] of Object.entries(c || {})) out[id] = normOffer({ id, ...o });
  return out;
}
export function normPlayer(p) {
  return {
    name: '', cash: 0, savings: 0, debt: 0, nw: 0, liq: 0, gain: 0, div: 0, penalties: 0,
    ...p,
    holdings: { ...(p?.holdings || {}) },
    history: { ...(p?.history || {}) },
  };
}
export const unitPrice = (o) => -toArr(o.flows)[0];

// ---------- cash flows of a holding

export function modFactor(offer, t, modifiers) {
  let f = 1;
  for (const m of Object.values(modifiers || {})) {
    const tags = toArr(m.tags);
    if (t >= m.from && t <= m.to && (tags.includes('*') || tags.includes(offer.tag))) f *= m.factor;
  }
  return f;
}

// Cash the holding pays at absolute time t (positive flows are adjusted by events).
export function holdingFlow(offer, h, t, modifiers) {
  const flows = toArr(offer.flows);
  const k = t - h.year;
  if (k < 1 || k >= flows.length) return 0;
  let v = flows[k] * h.units;
  if (v > 0) v *= modFactor(offer, t, modifiers);
  return r2(v);
}

export const holdingEnd = (offer, h) => h.year + toArr(offer.flows).length - 1;

// Value today = present worth of the remaining cash flows at the bank rate.
export function holdingValue(offer, h, T, rate, modifiers) {
  let v = 0;
  for (let t = T + 1; t <= holdingEnd(offer, h); t++) {
    v += holdingFlow(offer, h, t, modifiers) / Math.pow(1 + rate, t - T);
  }
  return r2(v);
}

// ---------- valuation

export function valuate(p, catalog, T, rate, modifiers) {
  let hv = 0;
  const kinds = new Set();
  for (const h of Object.values(p.holdings || {})) {
    const o = catalog[h.offerId];
    if (!o) continue;
    hv += holdingValue(o, h, T, rate, modifiers);
    kinds.add(h.offerId);
  }
  const liq = r2(p.cash + p.savings - p.debt);
  return { hv: r2(hv), liq, nw: r2(liq + hv), div: kinds.size + (p.savings > 0 ? 1 : 0) };
}

export function revalue(p, catalog, T, rate, modifiers) {
  const v = valuate(p, catalog, T, rate, modifiers);
  p.nw = v.nw; p.liq = v.liq; p.div = v.div;
  return p;
}

// ---------- savings withdrawals
//
// Taking money out of savings costs an early-withdrawal penalty: a % of the
// amount withdrawn, deducted from what you receive. This is the downside of
// the bank: money you will need next year is better kept as cash (0%), while
// money left for two or more years still comes out ahead.

export const penaltyRate = (settings) => Math.max(0, Math.min(0.5, Number(settings?.withdrawPenalty) || 0));
const pctText = (r) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`;

// Withdraw a gross amount w from savings into cash. Returns the penalty paid.
export function withdrawGross(p, w, pr, lines, why) {
  w = r2(Math.min(w, p.savings));
  if (w <= 0) return 0;
  const fee = Math.floor(w * pr * 100 + 1e-6) / 100; // rounded in the student's favour
  p.savings = r2(p.savings - w);
  p.cash = r2(p.cash + w - fee);
  lines.push({ text: why, amt: 0, note: w });
  if (fee > 0) lines.push({ text: `Early-withdrawal penalty (${pctText(pr)})`, amt: -fee });
  p.penalties = r2((p.penalties || 0) + fee);
  return fee;
}

// Withdraw enough from savings to receive `need` in cash (or all of savings).
export function coverFromSavings(p, need, pr, lines, why) {
  if (need <= 0 || p.savings <= 0) return 0;
  const gross = Math.ceil((need / (1 - pr)) * 100 - 1e-6) / 100;
  return withdrawGross(p, gross, pr, lines, why);
}

// Biggest amount of cash a player could raise right now (savings net of penalty).
export function spendable(p, settings) {
  return r2(p.cash + p.savings * (1 - penaltyRate(settings)) - p.debt);
}

// Negative cash is covered from savings (with the penalty), then becomes
// overdraft debt. Debt is repaid automatically from cash as it comes in.
// (Debt only exists once savings are empty, so savings never need touching.)
export function settle(p, lines = [], pr = 0) {
  p.cash = r2(p.cash); p.savings = r2(p.savings); p.debt = r2(p.debt);
  if (p.cash < 0) {
    coverFromSavings(p, -p.cash, pr, lines, 'Not enough cash: withdrew from savings');
    if (p.cash < 0) {
      p.debt = r2(p.debt - p.cash);
      lines.push({ text: 'Cash ran out: borrowed on overdraft', amt: 0, note: -p.cash });
      p.cash = 0;
    }
  }
  if (p.debt > 0 && p.cash > 0) {
    const pay = Math.min(p.cash, p.debt);
    p.cash = r2(p.cash - pay); p.debt = r2(p.debt - pay);
    lines.push({ text: 'Repaid overdraft from cash', amt: 0, note: pay });
  }
  return p;
}

// ---------- applying a student's plan (at "Close market")
//
// order = { round, buys: { offerId: shares }, savingsAll: bool, savingsTarget: number }
//   1. Shares are paid from cash first; anything more comes out of savings (penalty).
//   2. savingsAll: all leftover cash is deposited.
//      otherwise savingsTarget is the savings balance the student wants; going
//      below the current balance is a withdrawal (penalty), above is a deposit.

export function applyOrder(p0, order, catalog, offerIds, T, settings = {}) {
  const p = normPlayer(clone(p0));
  const pr = penaltyRate(settings);
  const lines = [];
  let budget = spendable(p, settings);
  let spend = 0;
  const buys = order?.buys || {};
  for (const id of offerIds || []) {
    const o = catalog[id];
    if (!o) continue;
    let want = Math.max(0, Math.min(1000, Math.floor(Number(buys[id]) || 0)));
    if (!want) continue;
    const price = unitPrice(o);
    const can = budget > 0 && price > 0 ? Math.floor(budget / price + 1e-9) : 0;
    if (want > can) {
      lines.push({ text: `Not enough money for ${want} ${o.name}; bought ${can}`, amt: 0 });
      want = can;
    }
    if (!want) continue;
    budget = r2(budget - want * price);
    spend = r2(spend + want * price);
    const key = `${id}_${T}`;
    const h = p.holdings[key] || { offerId: id, year: T, units: 0 };
    h.units += want;
    p.holdings[key] = h;
    lines.push({ text: `Bought ${want} × ${o.name}`, amt: r2(-want * price) });
  }
  p.cash = r2(p.cash - spend);
  if (p.cash < 0) coverFromSavings(p, -p.cash, pr, lines, 'Withdrew from savings to pay for shares');
  if (p.cash < 0 && p.cash > -0.05) p.cash = 0; // rounding dust

  if (order?.savingsAll) {
    if (p.cash >= 0.01) {
      lines.push({ text: 'Deposited leftover cash in savings', amt: 0, note: p.cash });
      p.savings = r2(p.savings + p.cash); p.cash = 0;
    }
  } else if (order && order.savingsTarget != null) {
    const target = Math.max(0, Number(order.savingsTarget) || 0);
    // Differences under $1 are rounding, not a decision: leave them alone.
    if (target > p.savings + 0.995) {
      const dep = r2(Math.min(target - p.savings, p.cash));
      if (dep >= 1) {
        p.savings = r2(p.savings + dep); p.cash = r2(p.cash - dep);
        lines.push({ text: 'Deposited cash in savings', amt: 0, note: dep });
      }
    } else if (target < p.savings - 0.995) {
      withdrawGross(p, p.savings - target, pr, lines, 'Withdrew from savings to cash');
    }
  }
  settle(p, lines, pr);
  return { player: p, lines };
}

// What a plan would cost in penalties (for the student preview).
export function previewOrder(p, order, catalog, offerIds, T, settings) {
  const { player, lines } = applyOrder(p, order, catalog, offerIds, T, settings);
  const fee = lines.filter((l) => /penalty/i.test(l.text)).reduce((s, l) => s - l.amt, 0);
  return { player, lines, fee: r2(fee) };
}

// ---------- end of year T -> T+1

export function yearEnd(p0, catalog, T, settings, modifiers) {
  const p = normPlayer(clone(p0));
  const pr = penaltyRate(settings);
  const lines = [];
  const t1 = T + 1;
  if (p.savings > 0) {
    const int = r2(p.savings * settings.bankRate);
    p.savings = r2(p.savings + int);
    lines.push({ text: `Savings interest at ${(settings.bankRate * 100).toFixed(1).replace(/\.0$/, '')}%`, amt: int });
  }
  if (p.debt > 0) {
    const int = r2(p.debt * settings.overdraftRate);
    p.debt = r2(p.debt + int);
    lines.push({ text: `Overdraft interest at ${Math.round(settings.overdraftRate * 100)}%`, amt: -int });
  }
  for (const [key, h] of Object.entries(p.holdings)) {
    const o = catalog[h.offerId];
    if (!o) continue;
    const f = holdingFlow(o, h, t1, modifiers);
    const done = t1 >= holdingEnd(o, h);
    if (f) {
      p.cash = r2(p.cash + f);
      lines.push({ text: `${o.name} × ${h.units}${done ? ' (final payment)' : ''}`, amt: f });
    }
    if (done) delete p.holdings[key];
  }
  settle(p, lines, pr);
  return { player: p, lines };
}

// ---------- events

export function sharesWithTags(p, catalog, tags, T) {
  let n = 0;
  for (const h of Object.values(p.holdings || {})) {
    const o = catalog[h.offerId];
    if (o && (tags.includes('*') || tags.includes(o.tag)) && holdingEnd(o, h) > T) n += h.units;
  }
  return n;
}

export function applyCash(p0, amount, text, settings = {}) {
  const p = normPlayer(clone(p0));
  const lines = [{ text, amt: r2(amount) }];
  p.cash = r2(p.cash + amount);
  settle(p, lines, penaltyRate(settings));
  return { player: p, lines };
}

// ---------- random market draw
//
// Picks `count` offers not shown in earlier years (repeats only once the pool
// runs out). At most one offer with negative PW at the current bank rate
// (two when 5+ offers are shown), and at least one when the pool has any,
// so every market has a trap for the class to find.

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drawOffers(catalog, { count = 4, exclude = [], rate = 0.05, rng = Math.random } = {}) {
  const all = Object.values(catalog);
  let pool = all.filter((o) => !exclude.includes(o.id));
  if (pool.length < count) pool = [...pool, ...shuffle(all.filter((o) => exclude.includes(o.id)), rng)].slice(0, Math.max(count, pool.length));
  const mixed = shuffle(pool, rng);
  const isTrap = (o) => pw(toArr(o.flows), rate) < 0;
  const maxTraps = count >= 5 ? 2 : 1;
  const pick = [];
  const firstTrap = mixed.find(isTrap);
  if (firstTrap && count >= 3) pick.push(firstTrap);
  for (const o of mixed) {
    if (pick.length >= count) break;
    if (pick.includes(o)) continue;
    if (isTrap(o) && pick.filter(isTrap).length >= maxTraps) continue;
    pick.push(o);
  }
  for (const o of mixed) { // pool too small for the trap limit: fill anyway
    if (pick.length >= count) break;
    if (!pick.includes(o)) pick.push(o);
  }
  return shuffle(pick, rng).map((o) => o.id);
}

// ---------- ranking

export const RANKINGS = {
  nw: { label: 'Net worth', help: 'Cash + savings + present worth of investments − debt', key: (p) => p.nw, fmt: 'money' },
  liq: { label: 'Liquid capital', help: 'Money you can spend today: cash + savings − debt', key: (p) => p.liq, fmt: 'money' },
  gain: { label: 'Gain last year', help: 'Change in net worth over the last year', key: (p) => p.gain, fmt: 'signed' },
  div: { label: 'Diversification', help: 'Number of different places your money is working (ties broken by net worth)', key: (p) => p.div + p.nw / 1e9, fmt: 'count' },
};

export function rank(players, by = 'nw') {
  const R = RANKINGS[by] || RANKINGS.nw;
  const list = Object.entries(players || {}).map(([pid, p]) => ({ pid, ...normPlayer(p) }));
  list.sort((a, b) => R.key(b) - R.key(a) || a.name.localeCompare(b.name));
  let prev = null, place = 0;
  list.forEach((p, i) => {
    const k = R.key(p);
    if (prev === null || Math.abs(k - prev) > 1e-9) place = i + 1;
    p.place = place; prev = k;
  });
  return list;
}
