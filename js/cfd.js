// Cash-flow diagram renderer (returns an SVG string).
// Up arrows are money in, down arrows are money out, drawn to scale like the
// textbook. Colors come from CSS classes so the diagram follows the theme.

import { shortMoney, esc } from './util.js';

export function cfdSVG(flows, opts = {}) {
  const {
    units = 1,
    t0 = null,        // absolute year of time 0 (labels become calendar years)
    now = null,       // absolute "current" year: flows at or before it are dimmed
    width = 340,
    height = 160,
    title = 'Cash-flow diagram',
    big = false,
  } = opts;
  const f = flows.map((v) => (Number(v) || 0) * units);
  const n = Math.max(1, f.length - 1);
  const fs = big ? 17 : 11;
  const padL = big ? 26 : 18, padR = big ? 26 : 18;
  const top = fs + 8, bottom = height - (fs + 10);
  const posMax = Math.max(0, ...f);
  const negMax = Math.max(0, ...f.map((v) => -v));
  const total = posMax + negMax || 1;
  const usable = bottom - top - 2 * (fs + 2);
  const axisY = top + fs + 2 + (usable * posMax) / total;
  const dx = (width - padL - padR) / n;
  const smallLabels = dx < (big ? 52 : 36);
  const lfs = smallLabels ? fs - 1 : fs;
  const x = (k) => padL + k * dx;

  let s = `<svg class="cfd${big ? ' cfd-big' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">`;
  s += `<title>${esc(title)}</title>`;
  s += `<line class="cfd-axis" x1="${padL - 8}" y1="${axisY}" x2="${width - padR + 10}" y2="${axisY}"/>`;
  s += `<path class="cfd-axis-head" d="M${width - padR + 10},${axisY} l-6,-3.5 v7 z"/>`;
  for (let k = 0; k < f.length; k++) {
    const xx = x(k);
    const tAbs = t0 == null ? k : t0 + k;
    const past = now != null && tAbs <= now;
    s += `<line class="cfd-tick" x1="${xx}" y1="${axisY - 3}" x2="${xx}" y2="${axisY + 3}"/>`;
    // time label sits under the axis, nudged right so down arrows don't cover it
    const v = f[k];
    const lx = v < 0 ? xx + 4 : xx;
    const anchor = v < 0 ? 'start' : 'middle';
    s += `<text class="cfd-time" x="${lx}" y="${axisY + fs + 3}" font-size="${fs - 1}" text-anchor="${anchor}">${tAbs}</text>`;
    if (!v) continue;
    const len = Math.max(8, (Math.abs(v) / total) * usable);
    const up = v > 0;
    const tip = up ? axisY - len : axisY + len;
    const cls = `${up ? 'cfd-in' : 'cfd-out'}${past ? ' cfd-past' : ''}`;
    s += `<g class="${cls}">`;
    s += `<line x1="${xx}" y1="${axisY}" x2="${xx}" y2="${up ? tip + 6 : tip - 6}" stroke-width="${big ? 3.5 : 2.5}"/>`;
    s += up
      ? `<path d="M${xx},${tip} l-${big ? 6 : 4.5},7 h${big ? 12 : 9} z"/>`
      : `<path d="M${xx},${tip} l-${big ? 6 : 4.5},-7 h${big ? 12 : 9} z"/>`;
    const ly = up ? tip - 4 : tip + lfs + 1;
    s += `<text x="${xx}" y="${ly}" font-size="${lfs}" text-anchor="middle">${shortMoney(v)}</text>`;
    s += `</g>`;
  }
  s += `</svg>`;
  return s;
}

export function flowTable(flows, units = 1) {
  const cells = flows.map((v, k) => `<tr><td>${k}</td><td class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${
    v === 0 ? '0' : (v < 0 ? '−' : '+') + '$' + shortMoney(v * units)}</td></tr>`).join('');
  return `<table class="flow-table"><thead><tr><th>End of year</th><th>Cash flow</th></tr></thead><tbody>${cells}</tbody></table>`;
}
