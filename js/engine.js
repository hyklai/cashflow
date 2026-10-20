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
  let lo = -0.99, hi = 2;
  let flo = pw(flows, lo), fhi = pw(flows, hi);
  if (flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, fm = pw(flows, mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
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
    name: '', cash: 0, savings: 0, debt: 0, nw: 0, liq: 0, gain: 0, div: 0,
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

// Negative cash is covered from savings, then becomes overdraft debt.
// Any debt is repaid automatically from cash, then savings.
export function settle(p, lines = []) {
  p.cash = r2(p.cash); p.savings = r2(p.savings); p.debt = r2(p.debt);
  if (p.cash < 0) {
    const take = Math.min(p.savings, -p.cash);
    if (take > 0) {
      p.savings = r2(p.savings - take); p.cash = r2(p.cash + take);
      lines.push({ text: 'Moved from savings to cover a shortfall', amt: 0, note: take });
    }
    if (p.cash < 0) {
      p.debt = r2(p.debt - p.cash);
      lines.push({ text: 'Cash ran out: borrowed on overdraft', amt: 0, note: -p.cash });
      p.cash = 0;
    }
  }
  if (p.debt > 0) {
    for (const src of ['cash', 'savings']) {
      const pay = Math.min(p[src], p.debt);
      if (pay > 0) {
        p[src] = r2(p[src] - pay); p.debt = r2(p.debt - pay);
        lines.push({ text: `Repaid overdraft from ${src}`, amt: 0, note: pay });
      }
    }
  }
  return p;
}

// ---------- applying a student's plan (at "Close market")
//
// order = { round, buys: { offerId: shares }, savingsAll: bool, savingsTarget: number }
// All liquid money (cash + savings - debt) is pooled, purchases are paid from
// the pool, then the student's chosen amount goes to savings and the rest is cash.

export function applyOrder(p0, order, catalog, offerIds, T) {
  const p = normPlayer(clone(p0));
  const lines = [];
  let pool = r2(p.cash + p.savings - p.debt);
  const buys = order?.buys || {};
  for (const id of offerIds || []) {
    const o = catalog[id];
    if (!o) continue;
    let want = Math.max(0, Math.min(1000, Math.floor(Number(buys[id]) || 0)));
    if (!want) continue;
    const price = unitPrice(o);
    const can = pool > 0 && price > 0 ? Math.floor(pool / price + 1e-9) : 0;
    if (want > can) {
      lines.push({ text: `Not enough money for ${want} ${o.name}; bought ${can}`, amt: 0 });
      want = can;
    }
    if (!want) continue;
    pool = r2(pool - want * price);
    const key = `${id}_${T}`;
    const h = p.holdings[key] || { offerId: id, year: T, units: 0 };
    h.units += want;
    p.holdings[key] = h;
    lines.push({ text: `Bought ${want} × ${o.name}`, amt: r2(-want * price) });
  }
  if (pool < 0) {
    p.debt = r2(-pool); p.cash = 0; p.savings = 0;
  } else {
    p.debt = 0;
    const target = order?.savingsAll ? pool : Math.max(0, Number(order?.savingsTarget) || 0);
    p.savings = r2(Math.min(target, pool));
    p.cash = r2(pool - p.savings);
  }
  return { player: p, lines };
}

// ---------- end of year T -> T+1

export function yearEnd(p0, catalog, T, settings, modifiers) {
  const p = normPlayer(clone(p0));
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
  settle(p, lines);
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

export function applyCash(p0, amount, text) {
  const p = normPlayer(clone(p0));
  const lines = [{ text, amt: r2(amount) }];
  p.cash = r2(p.cash + amount);
  settle(p, lines);
  return { player: p, lines };
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
