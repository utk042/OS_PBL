import { esc, pageHead, table, $, $$, badge } from './dom.js';
import { RESOURCES, BANKER_EXAMPLE, DETECTION_EXAMPLE, need, isSafe, requestResources, detectDeadlock, recover, coffman } from '../os/deadlock.js';

const copy = (o) => JSON.parse(JSON.stringify(o));
let bank = copy(BANKER_EXAMPLE);
let det = copy(DETECTION_EXAMPLE);

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 3 · Deadlock', 'Deadlock avoidance, detection and recovery', 'Repository jobs hold and request four kinds of resources: database connections, worker threads, I/O buffers and temporary disk. All numbers in the matrices can be edited.')}
  <div class="card">
    <h2>Banker’s algorithm (avoidance)</h2>
    <p class="sub">Each job declares its maximum need in advance. A request is granted only if the state afterwards is still <b>safe</b>, meaning some order exists in which every job can get its remaining need and finish.</p>
    <div id="bank"></div>
    <h3>Make a request</h3>
    <div class="controls" id="reqf">
      <label class="field">Job<select id="rp">${bank.processes.map((p, i) => `<option value="${i}">${esc(p)}</option>`).join('')}</select></label>
      ${RESOURCES.map((r, k) => `<label class="field">${esc(r)}<input type="number" min="0" data-r="${k}" value="${k === 0 ? 1 : k === 2 ? 2 : 0}"></label>`).join('')}
      <button class="primary" id="req">Request</button>
      <button id="resetb">Reset</button>
    </div>
    <div id="reqout"></div>
  </div>
  <div class="card">
    <h2>Detection and recovery</h2>
    <p class="sub">Here jobs did not declare a maximum; they simply hold resources and wait for more. The detection algorithm finds the jobs that can never finish; recovery aborts the cheapest of them (fewest resources held, i.e. least work lost) until the rest can run.</p>
    <div id="det"></div>
    <div class="controls" style="margin-top:12px"><button id="resetd">Reset</button></div>
    <div id="detout"></div>
  </div>
  <div class="card">
    <h2>Handling deadlock in the repository</h2>
    <div class="table-wrap"><table>
      <tr><th>Condition</th><th>Prevention: how to break it</th><th>Used in the repository?</th></tr>
      <tr><td>Mutual exclusion</td><td>Make resources shareable</td><td>Partly: search threads share the index for reading (readers–writers lock).</td></tr>
      <tr><td>Hold and wait</td><td>Request every resource at once</td><td>Yes for the backup job: it takes its DB connection, buffers and disk together.</td></tr>
      <tr><td>No pre-emption</td><td>Take resources back from a waiting job</td><td>Yes: an upload waiting too long for a buffer releases its DB connection and retries.</td></tr>
      <tr><td>Circular wait</td><td>Request resources in one global order</td><td>Yes: code always locks DB → worker → buffer → disk, and index shards in increasing order.</td></tr>
    </table></div>
  </div>`;

  const matrix = (name, rows, procs, editable = true, key = name) => `<table class="matrix"><thead><tr><th>${esc(name)}</th>${RESOURCES.map((r) => `<th class="num">${esc(r.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((row, i) => `<tr><td>${esc(procs ? procs[i] : '')}</td>${row.map((v, k) => `<td class="num">${editable ? `<input type="number" min="0" data-m="${key}" data-i="${i}" data-k="${k}" value="${v}">` : v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  const drawBank = () => {
    const nd = need(bank.max, bank.allocation);
    const s = isSafe(bank.available, bank.max, bank.allocation);
    const P = bank.processes;
    $(root, '#bank').innerHTML = `
      <div class="matrices">
        <div class="table-wrap">${matrix('Max', bank.max, P)}</div>
        <div class="table-wrap">${matrix('Allocation', bank.allocation, P)}</div>
        <div class="table-wrap">${matrix('Need', nd, P, false)}</div>
      </div>
      <div class="table-wrap" style="margin-top:10px;max-width:520px">${matrix('Available', [bank.available], ['free now'])}</div>
      <div style="margin:12px 0">${s.safe ? `<span class="badge good">✓ Safe state</span> Safe sequence: <b>${s.sequence.map((i) => esc(P[i])).join(' → ')}</b>` : `<span class="badge bad">✕ Unsafe state</span> These jobs might never finish: ${s.stuck.map((i) => esc(P[i])).join(', ')}`}</div>
      ${s.steps.length ? table([
        { label: 'Step', num: true, render: (_, i) => i + 1 },
        { label: 'Job', render: (x) => esc(P[x.process]) },
        { label: 'Need ≤ Work', render: (x) => `[${x.need.join(', ')}] ≤ [${x.workBefore.join(', ')}]` },
        { label: 'Work after it finishes', render: (x) => `[${x.workAfter.join(', ')}]` },
      ], s.steps) : ''}`;
  };

  const drawDet = () => {
    const P = det.processes;
    const d = detectDeadlock(det.available, det.allocation, det.request);
    const rec = recover(det.available, det.allocation, det.request);
    const c = coffman(det);
    $(root, '#det').innerHTML = `
      <div class="matrices">
        <div class="table-wrap">${matrix('Allocation', det.allocation, P, true, 'dAlloc')}</div>
        <div class="table-wrap">${matrix('Request', det.request, P, true, 'dReq')}</div>
        <div class="table-wrap">${matrix('Available', [det.available], ['free now'], true, 'dAvail')}</div>
      </div>`;
    $(root, '#detout').innerHTML = `
      <div class="grid2">
        <div>
          <h3>Result</h3>
          <div class="stack">
            <div>${d.deadlocked.length ? `<span class="badge bad">✕ Deadlock</span> ${d.deadlocked.map((i) => esc(P[i])).join(', ')} can never finish.` : `<span class="badge good">✓ No deadlock</span> All jobs can finish in the order ${d.order.map((i) => esc(P[i])).join(' → ')}.`}</div>
            ${d.deadlocked.length ? `<div>Recovery: abort <b>${rec.victims.map((i) => esc(P[i])).join(', ')}</b> (releasing its resources), after which the remaining jobs can finish.</div>` : ''}
          </div>
          <h3>Coffman conditions in this state</h3>
          <div class="stack">
            <div>${badge(c.mutualExclusion, 'Mutual exclusion', '')}</div>
            <div>${badge(c.holdAndWait, 'Hold and wait', 'No job holds and waits')}</div>
            <div>${badge(c.noPreemption, 'No pre-emption', '')}</div>
            <div>${badge(c.circularWait, 'Circular wait', 'No circular wait', true)}</div>
          </div>
        </div>
        <div><h3>Resource-allocation graph</h3>${rag(det, d.deadlocked)}</div>
      </div>`;
  };

  const onMatrix = (e, target, redraw) => {
    const el = e.target;
    if (!el.dataset.m) return;
    const v = Math.max(0, Number(el.value) || 0);
    const map = { Max: 'max', Allocation: 'allocation', Available: 'available', dAlloc: 'allocation', dReq: 'request', dAvail: 'available' };
    const key = map[el.dataset.m];
    if (key === 'available') target.available[Number(el.dataset.k)] = v;
    else target[key][Number(el.dataset.i)][Number(el.dataset.k)] = v;
    redraw();
  };
  $(root, '#bank').addEventListener('change', (e) => onMatrix(e, bank, drawBank));
  $(root, '#det').addEventListener('change', (e) => onMatrix(e, det, drawDet));

  $(root, '#req').addEventListener('click', () => {
    const pid = Number($(root, '#rp').value);
    const req = $$(root, '[data-r]').map((el) => Math.max(0, Number(el.value) || 0));
    const r = requestResources(bank, pid, req);
    if (r.granted) { bank = r.state; drawBank(); }
    $(root, '#reqout').innerHTML = `<div class="callout ${r.granted ? 'good' : 'bad'}"><b>${esc(bank.processes[pid])}</b> requests [${req.join(', ')}]: ${esc(r.reason)}.${r.safety && r.safety.safe ? ` Safe sequence afterwards: ${r.safety.sequence.map((i) => esc(bank.processes[i])).join(' → ')}.` : ''}</div>`;
  });
  $(root, '#resetb').addEventListener('click', () => { bank = copy(BANKER_EXAMPLE); $(root, '#reqout').innerHTML = ''; drawBank(); });
  $(root, '#resetd').addEventListener('click', () => { det = copy(DETECTION_EXAMPLE); drawDet(); });
  drawBank();
  drawDet();
}

// Processes on the left, resources on the right. Solid: resource assigned to process; dashed: process requests resource.
function rag(state, dead) {
  const P = state.processes;
  const W = 460;
  const rowH = 52;
  const H = Math.max(P.length, RESOURCES.length) * rowH + 20;
  const py = (i) => 30 + i * rowH;
  const ry = (k) => 30 + k * ((H - 60) / Math.max(1, RESOURCES.length - 1));
  const px = 90;
  const rx = W - 90;
  let edges = '';
  state.allocation.forEach((row, i) => row.forEach((v, k) => { if (v) edges += `<line x1="${rx - 22}" y1="${ry(k)}" x2="${px + 20}" y2="${py(i)}" stroke="var(--s1)" stroke-width="2" marker-end="url(#ah)"><title>${RESOURCES[k]} → ${P[i]}: ${v} assigned</title></line>`; }));
  state.request.forEach((row, i) => row.forEach((v, k) => { if (v) edges += `<line x1="${px + 20}" y1="${py(i)}" x2="${rx - 22}" y2="${ry(k)}" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ar)"><title>${P[i]} requests ${v} × ${RESOURCES[k]}</title></line>`; }));
  const procs = P.map((p, i) => `<g><circle cx="${px}" cy="${py(i)}" r="18" fill="var(--surface)" stroke="${dead.includes(i) ? 'var(--bad)' : 'var(--text-2)'}" stroke-width="${dead.includes(i) ? 3 : 1.5}"/><text x="${px - 26}" y="${py(i) + 4}" text-anchor="end" font-size="12" fill="var(--text)">${esc(p)}</text><text x="${px}" y="${py(i) + 4}" text-anchor="middle" font-size="11" fill="var(--text-2)">P${i}</text></g>`).join('');
  const res = RESOURCES.map((r, k) => `<g><rect x="${rx - 20}" y="${ry(k) - 16}" width="40" height="32" rx="5" fill="var(--surface-2)" stroke="var(--text-2)"/><text x="${rx}" y="${ry(k) + 4}" text-anchor="middle" font-size="11" fill="var(--text)">R${k}</text><text x="${rx + 26}" y="${ry(k) + 4}" font-size="12" fill="var(--text)">${esc(r.split(' ')[0])}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W + 30} ${H}" width="100%" role="img" aria-label="Resource-allocation graph">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--s1)"/></marker>
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--s2)"/></marker></defs>
    ${edges}${procs}${res}</svg>
    <div class="legend"><span><i class="dot" style="background:var(--s1)"></i>assigned (resource → job)</span><span><i class="dot" style="background:var(--s2)"></i>requested (job → resource, dashed)</span><span><i class="dot" style="background:var(--bad)"></i>deadlocked job (red ring)</span></div>`;
}
