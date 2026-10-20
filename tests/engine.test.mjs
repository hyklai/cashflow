// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { DEFAULT_OFFERS, DEFAULT_SETTINGS, EVENT_PRESETS, resolveEvent } from '../js/catalog.js';

const catalog = Object.fromEntries(DEFAULT_OFFERS.map((o) => [o.id, o]));
const S = DEFAULT_SETTINGS;                 // 5% bank, 5% withdrawal penalty
const NOPEN = { ...S, withdrawPenalty: 0 };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const fresh = (extra = {}) => E.normPlayer({ name: 'A', cash: 10000, ...extra });

test('textbook metrics', () => {
  near(E.pw([-2000, 700, 700, 700], 0.05), -93.73);
  near(E.pw(catalog.foodtruck.flows, 0.05), 456.65);
  near(E.fw([-1000, 0, 0, 1157.63], 0.05), 0, 0.01);
  near(E.aw([-1000, 0, 0, 0, 0, 1276.28], 0.05), 0, 0.01);
  near(E.irr([-1000, 1100]), 0.10, 1e-6);
  assert.equal(E.irr([-1000, -5]), null);
  near(1000 * Math.pow(1.06, 8), 1593.85); // the CD really is 6% compounded for 8 years
});

test('catalog: unique ids, prices negative, a handful of traps', () => {
  assert.equal(new Set(DEFAULT_OFFERS.map((o) => o.id)).size, DEFAULT_OFFERS.length);
  assert.ok(DEFAULT_OFFERS.length >= 35);
  for (const o of DEFAULT_OFFERS) assert.ok(o.flows[0] < 0, o.id);
  const bad = DEFAULT_OFFERS.filter((o) => E.pw(o.flows, 0.05) < -0.5).map((o) => o.id).sort();
  assert.deepEqual(bad, ['billboard', 'corpbond', 'gym', 'miningrig', 'phoneresale', 'rooftop', 'scooters']);
});

test('random draws: no repeats until the pool runs out, at most one trap', () => {
  let rng = 1;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  for (let game = 0; game < 50; game++) {
    const used = [];
    for (let y = 0; y < 8; y++) {
      const d = E.drawOffers(catalog, { count: 4, exclude: used, rate: 0.05, rng: rand });
      assert.equal(d.length, 4);
      assert.equal(new Set(d).size, 4);
      assert.ok(d.every((id) => !used.includes(id)), 'no repeats within 38 offers x 8 years');
      assert.ok(d.filter((id) => E.pw(catalog[id].flows, 0.05) < 0).length <= 1);
      used.push(...d);
    }
  }
  // pool exhausted: still returns a full market
  const all = Object.keys(catalog);
  assert.equal(E.drawOffers(catalog, { count: 4, exclude: all.slice(2) }).length, 4);
});

test('plan paid from cash: no penalty', () => {
  const { player: p, lines } = E.applyOrder(fresh(), { buys: { foodtruck: 2, bond7: 1 }, savingsTarget: 3000 }, catalog, ['bond7', 'foodtruck'], 0, S);
  assert.equal(p.savings, 3000);
  assert.equal(p.cash, 2000);
  assert.ok(!lines.some((l) => /penalty/i.test(l.text)));
  E.revalue(p, catalog, 0, 0.05, {});
  near(p.nw, 10000 + 2 * 456.65 + 55.87, 0.05);
});

test('buying with savings money costs the penalty', () => {
  const p0 = fresh({ cash: 1000, savings: 5000 });
  const { player: p, fee } = E.previewOrder(p0, { buys: { foodtruck: 1 }, savingsTarget: 5000 }, catalog, ['foodtruck'], 1, S);
  // need $1,000 from savings: withdraw 1000/0.95 = 1052.64, penalty 52.63
  near(fee, 52.63);
  near(p.savings, 5000 - 1052.64, 0.02);
  near(p.cash, 0, 0.02);
  assert.equal(p.holdings.foodtruck_1.units, 1);
});

test('spendable money accounts for the penalty; never overspends', () => {
  const p0 = fresh({ cash: 0, savings: 4200 });
  near(E.spendable(p0, S), 3990);
  const { player: p, lines } = E.applyOrder(p0, { buys: { drone: 1, foodtruck: 3 } }, catalog, ['drone', 'foodtruck'], 2, S);
  assert.equal(p.holdings.drone_2, undefined); // $4,000 > $3,990 available
  assert.equal(p.holdings.foodtruck_2.units, 1);
  assert.ok(lines.some((l) => /Not enough/.test(l.text)));
  assert.ok(p.cash >= 0 && p.debt === 0);
});

test('lowering the savings balance is a penalised withdrawal; raising it is a deposit', () => {
  let { player: p } = E.applyOrder(fresh({ cash: 0, savings: 2000 }), { buys: {}, savingsTarget: 1000 }, catalog, [], 1, S);
  near(p.savings, 1000); near(p.cash, 950); near(p.penalties, 50);
  ({ player: p } = E.applyOrder(fresh({ cash: 500, savings: 1000 }), { buys: {}, savingsAll: true }, catalog, [], 1, S));
  near(p.savings, 1500); near(p.cash, 0);
  ({ player: p } = E.applyOrder(fresh({ cash: 500, savings: 1000 }), { buys: {}, savingsTarget: 9999 }, catalog, [], 1, S));
  near(p.savings, 1500); near(p.cash, 0);
});

test('the lesson: savings lose for 1 year, win for 2+ years', () => {
  const run = (years) => {
    let p = E.applyOrder(fresh({ cash: 1000 }), { buys: {}, savingsAll: true }, catalog, [], 0, S).player;
    for (let T = 0; T < years; T++) p = E.yearEnd(p, catalog, T, S, {}).player;
    p = E.applyOrder(p, { buys: {}, savingsTarget: 0 }, catalog, [], years, S).player;
    return p.cash;
  };
  assert.ok(run(1) < 1000, `1 year: ${run(1)}`);
  assert.ok(run(2) > 1000, `2 years: ${run(2)}`);
});

test('bills come out of cash, then savings with penalty, then overdraft', () => {
  // cash covers it
  let p = E.applyCash(fresh({ cash: 800, savings: 3000 }), -500, 'Car repair', S).player;
  near(p.cash, 300); near(p.savings, 3000);
  // savings cover it
  p = E.applyCash(fresh({ cash: 0, savings: 3000 }), -500, 'Car repair', S).player;
  near(p.savings, 3000 - 526.32); near(p.cash, 0, 0.02);
  // nothing left: overdraft at 15%, repaid as cash comes in
  p = E.applyOrder(fresh(), { buys: { foodtruck: 5 } }, catalog, ['foodtruck'], 0, S).player;
  p = E.applyCash(p, -500, 'Car repair', S).player;
  assert.equal(p.debt, 500);
  p = E.yearEnd(p, catalog, 0, S, {}).player;
  assert.equal(p.debt, 0);
  near(p.cash, 3000 - 575);
});

test('a full game without withdrawals matches the PW bookkeeping', () => {
  let p = fresh();
  p = E.applyOrder(p, { buys: { foodtruck: 1, cd6: 2 }, savingsAll: true }, catalog, ['foodtruck', 'cd6'], 0, S).player;
  for (let T = 0; T < 8; T++) p = E.yearEnd(p, catalog, T, S, {}).player;
  assert.deepEqual(p.holdings, {});
  near(p.savings, 6000 * Math.pow(1.05, 8), 0.1);
  near(p.cash, 600 * 3 + 1000 + 2 * 1593.85);
  assert.equal(p.penalties, 0);
});

test('college savings plan: later payments are taken from cash, else savings', () => {
  let p = E.applyOrder(fresh(), { buys: { annuity: 2 }, savingsAll: true }, catalog, ['annuity'], 3, S).player;
  assert.equal(p.savings, 9000);
  p = E.yearEnd(p, catalog, 3, S, {}).player;
  near(p.savings, 9450 - 1052.64);
  assert.ok(p.penalties > 52);
  for (let T = 4; T < 7; T++) p = E.yearEnd(p, catalog, T, S, {}).player;
  assert.deepEqual(p.holdings, {});
  assert.equal(p.debt, 0);
  // without a penalty the old behaviour is unchanged
  let q = E.applyOrder(fresh(), { buys: { annuity: 2 }, savingsAll: true }, catalog, ['annuity'], 3, NOPEN).player;
  for (let T = 3; T < 7; T++) q = E.yearEnd(q, catalog, T, NOPEN, {}).player;
  near(q.cash, 4700);
});

test('rate changes move valuations', () => {
  const p = E.applyOrder(fresh(), { buys: { solar: 2 } }, catalog, ['solar'], 1, S).player;
  const base = E.valuate(p, catalog, 1, 0.05, {}).nw;
  assert.ok(E.valuate(p, catalog, 1, 0.07, {}).nw < base, 'higher rate lowers value of fixed payments');
});

test('event presets hit everyone equally and scale with starting money', () => {
  for (const e of EVENT_PRESETS) assert.ok(['rate', 'cash'].includes(e.kind), e.id);
  const car = resolveEvent(EVENT_PRESETS.find((e) => e.id === 'carRepair'), { startCash: 10000 });
  assert.equal(car.amount, -500);
  assert.match(car.detail, /\$500/);
  assert.equal(resolveEvent(EVENT_PRESETS.find((e) => e.id === 'carRepair'), { startCash: 5000 }).amount, -250);
});

test('ranking handles ties and criteria', () => {
  const players = {
    a: { name: 'Ann', nw: 12000, liq: 1000, gain: 50, div: 3 },
    b: { name: 'Bo', nw: 12000, liq: 5000, gain: -20, div: 1 },
    c: { name: 'Cy', nw: 9000, liq: 9000, gain: 10, div: 1 },
  };
  assert.deepEqual(E.rank(players, 'nw').map((x) => x.place), [1, 1, 3]);
  assert.equal(E.rank(players, 'liq')[0].pid, 'c');
  assert.equal(E.rank(players, 'div')[0].pid, 'a');
});
