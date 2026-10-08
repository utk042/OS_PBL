// Small rendering helpers shared by every page (no framework).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (v, d = 2) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : esc(v));
export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => [...root.querySelectorAll(sel)];

// Categorical colour by entity (fixed order, never by rank). Past 8 entities, fall back to neutral.
export function colorOf(id, ids) {
  const i = ids.indexOf(id);
  return i >= 0 && i < 8 ? `var(--s${i + 1})` : 'var(--muted)';
}

export function pageHead(kicker, title, intro) {
  return `<div class="page-head"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${intro}</p></div>`;
}

export function tiles(items) {
  return `<div class="tiles">${items.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
}

// columns: [{ key, label, num?, render?(row) }]
export function table(columns, rows, { bestIndex = -1, cls = '' } = {}) {
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r, i) => `<tr class="${i === bestIndex ? 'best' : ''}">${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r, i) : fmt(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// Single-lane Gantt chart. segments: [{ id, start, end, label?, tip? }] with id null for idle.
export function gantt(segments, ids, { labelOf = (s) => s.id } = {}) {
  const total = segments.length ? segments[segments.length - 1].end : 0;
  if (!total) return '';
  const lane = segments.map((s) => {
    const w = ((s.end - s.start) / total) * 100;
    const idle = s.id === null;
    const tip = s.tip || (idle ? `CPU idle ${s.start}–${s.end}` : `${labelOf(s)}: runs ${s.start}–${s.end} (${s.end - s.start} units)`);
    return `<div class="gantt-seg ${idle ? 'idle' : ''}" style="flex:0 0 calc(${w}% - 2px);${idle ? '' : `background:${colorOf(s.id, ids)}`}" data-tip="${esc(tip)}">${w > 3.2 ? esc(idle ? '' : labelOf(s)) : ''}</div>`;
  }).join('');
  const ticks = [...new Set([0, ...segments.map((s) => s.end)])];
  const step = Math.max(1, Math.ceil(ticks.length / 24));
  const axis = ticks.filter((_, i) => i % step === 0 || i === ticks.length - 1).map((t) => `<span style="left:${(t / total) * 100}%">${t}</span>`).join('');
  return `<div class="gantt"><div class="gantt-lane">${lane}</div><div class="gantt-axis">${axis}</div></div>`;
}

// One lane per entity. spans: [{ row, start, end, tip }]; marks: [{ row, t, miss?, tip }]
export function laneChart(rows, spans, marks, total, ids) {
  const pct = (t) => (t / total) * 100;
  return `<div class="gantt-rows">${rows.map((r) => `<div class="row"><div class="lbl" title="${esc(r.label)}">${esc(r.label)}</div><div class="lane">
    ${spans.filter((s) => s.row === r.id).map((s) => `<i style="left:${pct(s.start)}%;width:calc(${pct(s.end - s.start)}% - 1px);background:${s.color || colorOf(r.id, ids)}" data-tip="${esc(s.tip)}"></i>`).join('')}
    ${marks.filter((m) => m.row === r.id).map((m) => `<span class="mark ${m.miss ? 'miss' : ''}" style="left:${pct(m.t)}%" data-tip="${esc(m.tip)}"></span>`).join('')}
  </div></div>`).join('')}
  <div class="row"><div></div><div class="gantt-axis">${axisTicks(total).map((t) => `<span style="left:${pct(t)}%">${t}</span>`).join('')}</div></div></div>`;
}

function axisTicks(total) {
  const step = total <= 20 ? 2 : total <= 60 ? 5 : total <= 150 ? 10 : 25;
  const out = [];
  for (let t = 0; t <= total; t += step) out.push(t);
  return out;
}

// Horizontal bar chart for one measure (single series -> one colour; the title names it).
export function bars(items, { label = (d) => d.label, value, format = (v) => fmt(v), highlight = () => false, color = 'var(--s1)' }) {
  const max = Math.max(...items.map(value), 1e-9);
  return `<div class="bars">${items.map((d) => {
    const v = value(d);
    return `<div class="bar-row ${highlight(d) ? 'hl' : ''}" data-tip="${esc(`${label(d)}: ${format(v)}`)}"><div class="lbl">${esc(label(d))}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%;background:${color}"></div></div><div class="val">${format(v)}</div></div>`;
  }).join('')}</div>`;
}

export function badge(ok, yes, no, warn = false) {
  return ok ? `<span class="badge good">✓ ${esc(yes)}</span>` : `<span class="badge ${warn ? 'warn' : 'bad'}">✕ ${esc(no)}</span>`;
}

export function legend(ids, labelOf) {
  return `<div class="legend">${ids.map((id) => `<span><i class="dot" style="background:${colorOf(id, ids)}"></i>${esc(labelOf(id))}</span>`).join('')}</div>`;
}

// One shared tooltip for every element carrying data-tip.
export function installTooltip() {
  const tip = document.createElement('div');
  tip.id = 'tip';
  document.body.appendChild(tip);
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.style.display = 'none'; return; }
    tip.textContent = el.dataset.tip;
    tip.style.display = 'block';
  });
  document.addEventListener('pointermove', (e) => {
    if (tip.style.display !== 'block') return;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY + 16}px`;
  });
  document.addEventListener('pointerleave', () => (tip.style.display = 'none'));
}

// Read numeric/text values from inputs inside root, keyed by data-k.
export function readForm(root) {
  const o = {};
  for (const el of $$(root, '[data-k]')) o[el.dataset.k] = el.type === 'number' ? Number(el.value) : el.type === 'checkbox' ? el.checked : el.value;
  return o;
}

export function segmented(name, options, value) {
  return `<div class="seg" data-seg="${esc(name)}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
}

export function onSegment(root, name, cb) {
  const seg = $(root, `[data-seg="${name}"]`);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$(seg, 'button').forEach((x) => x.classList.toggle('on', x === b));
    cb(b.dataset.v);
  });
}
