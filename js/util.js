// Small shared helpers (no DOM dependencies except $ / h).

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function money(x, { cents = false, sign = false } = {}) {
  const v = Number(x) || 0;
  const r = cents ? Math.round(v * 100) / 100 : Math.round(v);
  const s = Math.abs(r).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const pre = r < 0 ? '−' : sign && r > 0 ? '+' : '';
  return `${pre}$${s}`;
}

// Compact label for cash-flow diagrams: 1560 -> "1,560", 12500 -> "12.5k"
export function shortMoney(x) {
  const v = Math.abs(Number(x) || 0);
  if (v >= 10000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return Math.round(v * 100) % 100 === 0
    ? Math.round(v).toLocaleString('en-US')
    : v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export const pct = (r, d = 1) => `${(Number(r) * 100).toFixed(d).replace(/\.0+$/, '')}%`;

export function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// Player id derived from the display name; same name -> same id, which is
// what lets a student reconnect from another device with name + PIN.
export function slug(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 16);
}

export function genCode(n = 5) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => A[b % A.length]).join('');
}

export function randomId(n = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pinHash = (code, pid, pin) => sha256(`eegame:${code}:${pid}:${pin}`);

// Realtime Database turns arrays into objects in some cases; accept both.
export function toArr(x) {
  if (Array.isArray(x)) return x.map((v) => (v == null ? 0 : v));
  if (!x || typeof x !== 'object') return [];
  const keys = Object.keys(x).map(Number).filter((k) => !Number.isNaN(k));
  const n = keys.length ? Math.max(...keys) + 1 : 0;
  return Array.from({ length: n }, (_, i) => (x[i] == null ? 0 : x[i]));
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Tiny DOM builder for places where template strings get awkward.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

export function toast(msg, kind = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}
