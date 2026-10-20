// Shared subscription helper: keeps a live copy of the parts of a game a page needs.

import { normCatalog } from './engine.js';
import { toArr } from './util.js';

export function watchGame(backend, code, parts, onChange) {
  const state = { code, meta: null, catalog: {}, players: {}, joins: {}, orders: {}, presence: {}, loaded: new Set() };
  const unsubs = [];
  let queued = false;
  const changed = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; onChange(state); });
  };
  for (const part of parts) {
    const [key, path] = Array.isArray(part) ? part : [part, `games/${code}/${part}`];
    unsubs.push(backend.listen(path, (v) => {
      if (key === 'meta') state.meta = v ? normMeta(v) : null;
      else if (key === 'catalog') state.catalog = normCatalog(v);
      else state[key] = v ?? (key === 'myOrder' || key === 'myJoin' ? null : {});
      state.loaded.add(key);
      changed();
    }, (err) => {
      state.loaded.add(key);
      state.errors = { ...(state.errors || {}), [key]: err };
      changed();
    }));
  }
  state.stop = () => unsubs.forEach((u) => u && u());
  return state;
}

export function normMeta(m) {
  return {
    status: 'lobby', year: 0, rankBy: 'nw', view: 'auto', reveal: false, submitted: 0,
    ...m,
    settings: { ...(m.settings || {}) },
    offerIds: toArr(m.offerIds),
    nextOfferIds: toArr(m.nextOfferIds),
    modifiers: m.modifiers || {},
    events: m.events || {},
  };
}

export const STATUS_TEXT = {
  lobby: 'Waiting to start',
  open: 'Market open',
  closed: 'Market closed',
  results: 'Year results',
  ended: 'Game over',
};

export function joinUrl(code) {
  const u = new URL('student.html', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('g', code);
  if (new URLSearchParams(location.search).has('demo')) u.searchParams.set('demo', '1');
  return u.toString();
}

export function eventsForYear(meta, year) {
  return Object.values(meta.events || {}).filter((e) => e.year === year).sort((a, b) => a.ts - b.ts);
}
