import { esc, fmt, pageHead, table, gantt, legend, bars, tiles, $, segmented, onSegment } from './dom.js';
import { ALGORITHMS, REPOSITORY_WORKLOAD, QUEUES, schedule, compareAll } from '../os/scheduling.js';
import { listJobs } from '../repo/store.js';

let jobs = REPOSITORY_WORKLOAD.map((j) => ({ ...j }));
let algo = 'rr';
let quantum = 2;
let boost = 0;
let source = 'default';

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 2 · CPU scheduling', 'Scheduling the repository’s job queue', 'Short interactive requests (search, download) share one CPU with long batch jobs (OCR, indexing, thumbnails) and an admin backup. Pick an algorithm to see the Gantt chart and the waiting, turnaround and response times it gives each job. Priority: 1 is highest.')}
  <div class="card">
    <div class="controls">
      <div class="field">Workload ${segmented('src', [['default', 'Sample workload'], ['queue', 'Repository queue']], source)}</div>
      <label class="field">Algorithm<select id="algo">${Object.entries(ALGORITHMS).map(([k, a]) => `<option value="${k}" ${k === algo ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label class="field">Time quantum<input id="q" type="number" min="1" max="10" value="${quantum}"></label>
      <label class="field" title="MLFQ only: every N units move all jobs back to the top queue (0 = off)">MLFQ boost every<input id="boost" type="number" min="0" max="50" value="${boost}"></label>
    </div>
    <div id="srcnote"></div>
    <div id="editor"></div>
    <div class="controls" style="margin:10px 0 0"><button id="add" class="small">+ Add job</button></div>
  </div>
  <div class="card" id="result"></div>
  <div class="card" id="compare"></div>
  <div class="card">
    <h2>How each algorithm is implemented</h2>
    <div class="table-wrap"><table>
      <tr><th>Algorithm</th><th>Rule used at every time unit</th></tr>
      <tr><td>FCFS</td><td>Run jobs in arrival order, each to completion.</td></tr>
      <tr><td>SJF</td><td>When the CPU is free, pick the ready job with the smallest burst; no pre-emption.</td></tr>
      <tr><td>SRTF</td><td>Run the ready job with the least remaining time; a new shorter job pre-empts.</td></tr>
      <tr><td>Priority (NP / P)</td><td>Pick the highest priority ready job; the pre-emptive version switches when a higher priority job arrives.</td></tr>
      <tr><td>Round Robin</td><td>FIFO ready queue; a job runs for at most one quantum, then goes to the tail. Jobs arriving at time t are queued before the job whose quantum just ended.</td></tr>
      <tr><td>Multilevel Queue</td><td>Three fixed queues: system (FCFS) &gt; interactive (Round Robin) &gt; batch (FCFS). A higher queue always pre-empts a lower one.</td></tr>
      <tr><td>Multilevel Feedback Queue</td><td>Every job starts in Q0 (quantum q), moves down to Q1 (2q) and then Q2 (FCFS) when it uses its whole quantum. Optional boost moves everything back to Q0 to stop starvation.</td></tr>
    </table></div>
  </div>`;

  const editor = $(root, '#editor');
  const drawEditor = () => {
    editor.innerHTML = table([
      { label: 'Job', render: (j) => esc(j.id) },
      { label: 'Work', render: (j, i) => `<input type="text" data-i="${i}" data-f="name" value="${esc(j.name)}" style="width:100%;min-width:140px">` },
      { label: 'Queue', render: (j, i) => `<select data-i="${i}" data-f="queue">${QUEUES.map((q) => `<option ${q === j.queue ? 'selected' : ''}>${q}</option>`).join('')}</select>` },
      { label: 'Arrival', num: true, render: (j, i) => `<input type="number" min="0" data-i="${i}" data-f="arrival" value="${j.arrival}">` },
      { label: 'Burst', num: true, render: (j, i) => `<input type="number" min="1" data-i="${i}" data-f="burst" value="${j.burst}">` },
      { label: 'Priority', num: true, render: (j, i) => `<input type="number" min="1" data-i="${i}" data-f="priority" value="${j.priority}">` },
      { label: '', render: (j, i) => `<button class="small" data-del="${i}" aria-label="Remove ${esc(j.id)}">✕</button>` },
    ], jobs);
  };

  const run = () => {
    if (!jobs.length) { $(root, '#result').innerHTML = '<p class="note">Add at least one job.</p>'; $(root, '#compare').innerHTML = ''; return; }
    const opts = { quantum, boost };
    const r = schedule(algo, jobs, opts);
    const ids = jobs.map((j) => j.id);
    const name = (id) => jobs.find((j) => j.id === id)?.name || id;
    r.segments.forEach((s) => { if (s.id !== null) s.tip = `${s.id} ${name(s.id)}: ${s.start}–${s.end}${s.level !== undefined && s.level !== null ? ` (queue Q${s.level})` : ''}`; });
    $(root, '#result').innerHTML = `
      <h2>${esc(ALGORITHMS[algo].label)}${['rr', 'mlq', 'mlfq'].includes(algo) ? ` · quantum ${quantum}` : ''}</h2>
      <p class="sub">${ALGORITHMS[algo].preemptive ? 'Pre-emptive' : 'Non-pre-emptive'}. Hover a block for details.</p>
      ${tiles([
        [fmt(r.avgWaiting), 'avg waiting time'], [fmt(r.avgTurnaround), 'avg turnaround time'], [fmt(r.avgResponse), 'avg response time'],
        [fmt(r.interactiveResponse), 'avg response of interactive jobs'], [r.contextSwitches, 'context switches'], [`${Math.round(r.utilization * 100)}%`, 'CPU utilisation'],
      ])}
      ${gantt(r.segments, ids)}
      ${legend(ids, (id) => `${id} ${name(id)}`)}
      <h3>Per-job results</h3>
      ${table([
        { key: 'id', label: 'Job' }, { key: 'name', label: 'Work' }, { key: 'queue', label: 'Queue' },
        { key: 'arrival', label: 'Arrival', num: true }, { key: 'burst', label: 'Burst', num: true },
        { key: 'completion', label: 'Completion', num: true }, { key: 'turnaround', label: 'Turnaround', num: true },
        { key: 'waiting', label: 'Waiting', num: true }, { key: 'response', label: 'Response', num: true },
      ], r.rows)}`;

    const all = compareAll(jobs, opts);
    const bestW = all.reduce((b, x, i) => (x.avgWaiting < all[b].avgWaiting ? i : b), 0);
    $(root, '#compare').innerHTML = `
      <h2>All algorithms on this workload</h2>
      <p class="sub">Same jobs, quantum ${quantum}. The highlighted row has the lowest average waiting time.</p>
      <div class="grid2">
        <div><h3>Average waiting time</h3>${bars(all, { value: (d) => d.avgWaiting, highlight: (d) => d.key === algo })}</div>
        <div><h3>Average response time of interactive jobs</h3>${bars(all, { value: (d) => d.interactiveResponse, highlight: (d) => d.key === algo, color: 'var(--s3)' })}</div>
      </div>
      <h3>Table</h3>
      ${table([
        { key: 'label', label: 'Algorithm' }, { key: 'avgWaiting', label: 'Avg waiting', num: true }, { key: 'avgTurnaround', label: 'Avg turnaround', num: true },
        { key: 'avgResponse', label: 'Avg response', num: true }, { key: 'interactiveResponse', label: 'Interactive response', num: true },
        { key: 'maxWaiting', label: 'Max waiting', num: true }, { key: 'contextSwitches', label: 'Switches', num: true },
      ], all, { bestIndex: bestW })}`;
  };

  const loadSource = () => {
    if (source === 'queue') {
      const q = listJobs();
      jobs = q.length ? q.map((j) => ({ ...j })) : [];
      $(root, '#srcnote').innerHTML = q.length ? '' : '<p class="note">The repository queue is empty. Upload a document or search on the <a href="#/repository">Repository</a> page first.</p>';
    } else {
      jobs = REPOSITORY_WORKLOAD.map((j) => ({ ...j }));
      $(root, '#srcnote').innerHTML = '';
    }
    drawEditor();
    run();
  };

  onSegment(root, 'src', (v) => { source = v; loadSource(); });
  $(root, '#algo').addEventListener('change', (e) => { algo = e.target.value; run(); });
  $(root, '#q').addEventListener('input', (e) => { quantum = Math.max(1, Number(e.target.value) || 1); run(); });
  $(root, '#boost').addEventListener('input', (e) => { boost = Math.max(0, Number(e.target.value) || 0); run(); });
  editor.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.i === undefined) return;
    const j = jobs[Number(el.dataset.i)];
    j[el.dataset.f] = el.type === 'number' ? Math.max(el.dataset.f === 'burst' ? 1 : 0, Number(el.value) || 0) : el.value;
    run();
  });
  editor.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    jobs.splice(Number(b.dataset.del), 1);
    drawEditor();
    run();
  });
  $(root, '#add').addEventListener('click', () => {
    const n = Math.max(0, ...jobs.map((j) => Number(String(j.id).replace(/\D/g, '')) || 0)) + 1;
    jobs.push({ id: `J${n}`, name: 'New job', arrival: jobs.length ? Math.max(...jobs.map((j) => j.arrival)) + 1 : 0, burst: 3, priority: 3, queue: 'batch' });
    drawEditor();
    run();
  });
  loadSource();
}
