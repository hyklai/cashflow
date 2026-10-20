// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { DEFAULT_OFFERS, DEFAULT_SETTINGS, defaultOfferIdsForYear } from '../js/catalog.js';

const catalog = Object.fromEntries(DEFAULT_OFFERS.map((o) => [o.id, o]));
const S = DEFAULT_SETTINGS;
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const fresh = () => E.normPlayer({ name: 'A', cash: 10000 });

test('textbook metrics', () => {
  near(E.pw([-2000, 700, 700, 700], 0.05), -93.73);
  near(E.pw(catalog.foodtruck.flows, 0.05), 456.65);
  near(E.fw([-1000, 0, 0, 1157.63], 0.05), 0, 0.01);
  near(E.aw([-1000, 0, 0, 0, 0, 1276.28], 0.05), 0, 0.01);
  near(E.irr([-1000, 1100]), 0.10, 1e-6);
  assert.equal(E.irr([-1000, -5]), null);
  // the CD really is 6% compounded for 8 years
  near(1000 * Math.pow(1.06, 8), 1593.85);
});

test('answer key: which default offers beat the 5% bank rate', () => {
  const bad = DEFAULT_OFFERS.filter((o) => E.pw(o.flows, 0.05) < 0).map((o) => o.id).sort();
  assert.deepEqual(bad, ['billboard', 'miningrig', 'phoneresale']);
  for (let y = 0; y < 8; y++) assert.ok(defaultOfferIdsForYear(catalog, y).length >= 2, `year ${y}`);
});

test('applyOrder buys, saves, and keeps the rest as cash', () => {
  const { player: p } = E.applyOrder(fresh(), { buys: { foodtruck: 2, bond7: 1 }, savingsTarget: 3000 }, catalog, ['bond7', 'foodtruck'], 0);
  assert.equal(p.savings, 3000);
  assert.equal(p.cash, 10000 - 5000 - 3000);
  assert.equal(p.holdings.foodtruck_0.units, 2);
  E.revalue(p, catalog, 0, 0.05, {});
  near(p.nw, 10000 + 2 * 456.65 + 55.87, 0.05);
});

test('applyOrder never overspends and ignores offers not on the market', () => {
  const { player: p, lines } = E.applyOrder(fresh(), { buys: { drone: 5, foodtruck: 9 }, savingsAll: true }, catalog, ['drone'], 3);
  assert.equal(p.holdings.drone_3.units, 2);
  assert.equal(p.holdings.foodtruck_3, undefined);
  assert.equal(p.savings, 2000);
  assert.equal(p.cash, 0);
  assert.ok(lines.some((l) => /Not enough/.test(l.text)));
});

test('a full game is consistent: net worth equals PW accounting', () => {
  let p = fresh();
  p = E.applyOrder(p, { buys: { foodtruck: 1, cd6: 2 }, savingsAll: true }, catalog, ['foodtruck', 'cd6'], 0).player;
  for (let T = 0; T < 8; T++) p = E.yearEnd(p, catalog, T, S, {}).player;
  // everything matured by year 8
  assert.deepEqual(p.holdings, {});
  const sav0 = 10000 - 2000 - 2000;
  const expected = sav0 * Math.pow(1.05, 8)
    + 600 * (Math.pow(1.05, 7) + Math.pow(1.05, 6) + Math.pow(1.05, 5)) + 1000 * Math.pow(1.05, 4)
    + 2 * 1593.85;
  // food truck cash sits as idle cash (0%) unless the student saves it
  const idle = 600 * 3 + 1000;
  near(p.cash, idle + 2 * 1593.85);
  near(p.savings, sav0 * Math.pow(1.05, 8), 0.1);
  near(p.cash + p.savings, sav0 * Math.pow(1.05, 8) + idle + 2 * 1593.85, 0.1);
  assert.ok(expected > p.cash + p.savings, 'idle cash costs you interest');
});

test('emergency without liquidity goes to overdraft, then gets repaid', () => {
  let p = E.applyOrder(fresh(), { buys: { foodtruck: 5 } }, catalog, ['foodtruck'], 0).player;
  assert.equal(p.cash, 0);
  p = E.applyCash(p, -1500, 'Emergency').player;
  assert.equal(p.debt, 1500);
  p = E.yearEnd(p, catalog, 0, S, {}).player; // debt grows 15% then truck pays 3000
  assert.equal(p.debt, 0);
  near(p.cash, 3000 - 1725);
});

test('events: revenue modifiers and rate changes move valuations', () => {
  let p = E.applyOrder(fresh(), { buys: { solar: 2 } }, catalog, ['solar'], 1).player;
  const base = E.valuate(p, catalog, 1, 0.05, {}).nw;
  const boom = { m1: { tags: ['energy'], factor: 1.3, from: 2, to: 9999 } };
  assert.ok(E.valuate(p, catalog, 1, 0.05, boom).nw > base);
  assert.ok(E.valuate(p, catalog, 1, 0.07, {}).nw < base, 'higher rate lowers value of fixed payments');
  const y = E.yearEnd(p, catalog, 1, S, boom).player;
  near(y.cash, 4000 + 2 * 450 * 1.3);
  assert.equal(E.sharesWithTags(p, catalog, ['energy'], 1), 2);
});

test('college savings plan: later payments come out of cash automatically', () => {
  let p = E.applyOrder(fresh(), { buys: { annuity: 2 }, savingsAll: true }, catalog, ['annuity'], 3).player;
  assert.equal(p.savings, 9000);
  p = E.yearEnd(p, catalog, 3, S, {}).player;
  near(p.savings, 9000 * 1.05 - 1000);
  for (let T = 4; T < 7; T++) p = E.yearEnd(p, catalog, T, S, {}).player;
  near(p.cash, 4700);
  assert.deepEqual(p.holdings, {});
});

test('ranking handles ties and criteria', () => {
  const players = {
    a: { name: 'Ann', nw: 12000, liq: 1000, gain: 50, div: 3 },
    b: { name: 'Bo', nw: 12000, liq: 5000, gain: -20, div: 1 },
    c: { name: 'Cy', nw: 9000, liq: 9000, gain: 10, div: 1 },
  };
  const r = E.rank(players, 'nw');
  assert.deepEqual(r.map((x) => x.place), [1, 1, 3]);
  assert.equal(E.rank(players, 'liq')[0].pid, 'c');
  assert.equal(E.rank(players, 'div')[0].pid, 'a');
});
