import { fmt, pageHead, table, laneChart, tiles, $, segmented, onSegment, badge } from './dom.js';
import { KIOSK_TASKS, OVERLOADED_TASKS, simulateRT, utilization, liuLaylandBound, responseTimeAnalysis, hyperperiod, simulateInversion, INVERSION_SCENARIO } from '../os/rtos.js';

let preset = 'kiosk';
let tasks = KIOSK_TASKS.map((t) => ({ ...t }));

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 2 · Case study', 'CPU scheduling in real-time embedded systems', 'The library’s thesis-scanning kiosk feeds the repository. Its controller is a small embedded board running an RTOS with periodic tasks that must finish before their deadlines. This page analyses the task set (utilisation, Liu–Layland bound, response-time analysis) and simulates Rate Monotonic and Earliest Deadline First scheduling over one hyperperiod.')}
  <div class="card">
    <div class="controls">
      <div class="field">Task set ${segmented('preset', [['kiosk', 'Scanning kiosk (U = 0.81)'], ['over', 'Overloaded controller (U = 0.99)']], preset)}</div>
    </div>
    <div id="editor"></div>
  </div>
  <div class="card" id="analysis"></div>
  <div class="card" id="sim"></div>
  <div class="card" id="inv"></div>`;

  const drawEditor = () => {
    $(root, '#editor').innerHTML = table([
      { key: 'id', label: 'Task' }, { key: 'name', label: 'Work' },
      { label: 'C (execution)', num: true, render: (t, i) => `<input type="number" min="1" data-i="${i}" data-f="C" value="${t.C}">` },
      { label: 'T (period = deadline)', num: true, render: (t, i) => `<input type="number" min="1" data-i="${i}" data-f="T" value="${t.T}">` },
      { label: 'C / T', num: true, render: (t) => fmt(t.C / t.T, 3) },
    ], tasks);
  };

  const run = () => {
    const U = utilization(tasks);
    const bound = liuLaylandBound(tasks.length);
    const rta = responseTimeAnalysis(tasks);
    const H = hyperperiod(tasks);
    const rmOk = rta.every((r) => r.ok);
    $(root, '#analysis').innerHTML = `
      <h2>Schedulability analysis</h2>
      ${tiles([[fmt(U, 3), 'utilisation U = Σ C/T'], [fmt(bound, 3), `Liu–Layland bound n(2^(1/n) − 1), n = ${tasks.length}`], [H, 'hyperperiod (LCM of periods)']])}
      <div class="stack">
        <div>${badge(U <= bound, 'U ≤ bound: RM is guaranteed to meet all deadlines', 'U > bound: the RM bound test is inconclusive', true)}</div>
        <div>${badge(rmOk, 'Response-time analysis: RM meets every deadline', 'Response-time analysis: RM misses a deadline')}</div>
        <div>${badge(U <= 1, 'U ≤ 1: EDF meets every deadline', 'U > 1: no algorithm can meet every deadline')}</div>
      </div>
      <h3>Worst-case response time under RM (R = C + Σ ⌈R/Tj⌉·Cj over higher-priority tasks)</h3>
      ${table([{ key: 'id', label: 'Task' }, { key: 'R', label: 'R', num: true }, { key: 'D', label: 'Deadline', num: true }, { label: 'Result', render: (r) => badge(r.ok, 'meets', 'misses') }], rta)}`;

    const horizon = Math.min(H, 120);
    const ids = tasks.map((t) => t.id);
    const block = (policy) => {
      const s = simulateRT(tasks, policy, horizon);
      const spans = [];
      s.timeline.forEach((id, t) => {
        if (id === null) return;
        const last = spans[spans.length - 1];
        if (last && last.row === id && last.end === t) last.end = t + 1;
        else spans.push({ row: id, start: t, end: t + 1 });
      });
      spans.forEach((sp) => (sp.tip = `${sp.row}: runs ${sp.start}–${sp.end}`));
      const marks = s.releases.filter((r) => r.deadline <= horizon).map((r) => ({ row: r.task, t: r.deadline, tip: `${r.task} deadline at ${r.deadline}` }));
      s.misses.forEach((m) => marks.push({ row: m.task, t: m.deadline, miss: true, tip: `${m.task} MISSED its deadline at ${m.deadline} (released ${m.release})` }));
      return `<h3>${policy === 'rm' ? 'Rate Monotonic (fixed priority: shorter period first)' : 'Earliest Deadline First (dynamic priority)'}</h3>
        <p class="sub">${s.misses.length ? `<span class="badge bad">${s.misses.length} deadline miss${s.misses.length > 1 ? 'es' : ''}</span>` : '<span class="badge good">No deadline misses</span>'} · ${s.preemptions} pre-emptions · ${s.completed}/${s.jobs} jobs completed</p>
        ${laneChart(tasks.map((t) => ({ id: t.id, label: `${t.id} ${t.name}` })), spans, marks, horizon, ids)}`;
    };
    $(root, '#sim').innerHTML = `<h2>Simulation over ${horizon === H ? 'one hyperperiod' : 'the first 120 units'} (0–${horizon})</h2>
      <p class="sub">Thin marks are deadlines; red marks are misses. A job that misses its deadline is dropped, as an RTOS watchdog would do.</p>
      ${block('rm')}${block('edf')}`;
  };

  const inversion = () => {
    const ids = INVERSION_SCENARIO.map((t) => t.id);
    const part = (protocol) => {
      const s = simulateInversion(INVERSION_SCENARIO, protocol);
      const spans = [];
      s.timeline.forEach((x, t) => { if (x) spans.push({ row: x.id, start: t, end: t + 1, tip: `${x.id} runs at ${t}${x.holds.length ? ' holding the bus lock' : ''}${x.boosted ? ' (inherited high priority)' : ''}`, color: x.boosted ? 'var(--warn)' : undefined }); });
      const marks = INVERSION_SCENARIO.map((t) => ({ row: t.id, t: t.arrival, tip: `${t.id} arrives at ${t.arrival}` }));
      return `<h3>${protocol === 'none' ? 'Plain semaphore' : 'Priority inheritance'}: high-priority task finishes at t = ${s.result.H.finish}</h3>
        ${laneChart(INVERSION_SCENARIO.map((t) => ({ id: t.id, label: t.name })), spans, marks, s.timeline.length, ids)}`;
    };
    $(root, '#inv').innerHTML = `<h2>Priority inversion and priority inheritance</h2>
      <p class="sub">The low-priority log writer holds the shared bus lock when the high-priority sensor handler needs it. Without inheritance, the medium-priority compression task pre-empts the lock holder and delays the high-priority task, the bug that reset the Mars Pathfinder lander in 1997. With inheritance the lock holder temporarily runs at high priority (shown in amber).</p>
      ${part('none')}${part('inherit')}`;
  };

  onSegment(root, 'preset', (v) => { preset = v; tasks = (v === 'kiosk' ? KIOSK_TASKS : OVERLOADED_TASKS).map((t) => ({ ...t })); drawEditor(); run(); });
  $(root, '#editor').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.i === undefined) return;
    tasks[Number(el.dataset.i)][el.dataset.f] = Math.max(1, Number(el.value) || 1);
    run();
  });
  $(root, '#editor').addEventListener('change', drawEditor);
  drawEditor();
  run();
  inversion();
}
