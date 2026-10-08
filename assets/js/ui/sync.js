import { esc, pageHead, table, tiles, $, segmented, onSegment, badge } from './dom.js';
import { ALGORITHMS, checkAlgorithm, checkAll } from '../os/mutex.js';

let algo = 'lock';
let rounds = [1, 2];

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 3 · Concurrency', 'The critical section: race conditions and their fixes', 'Two upload threads update the shared “documents uploaded” counter: <code>tmp = counter; counter = tmp + 1</code>. Each solution below is checked by exploring <b>every</b> possible interleaving of the two threads (a breadth-first search of the state space), so the verdicts are proofs for this program, not lucky test runs.')}
  <div class="card">
    <div class="controls">
      <div class="field">Solution ${segmented('algo', Object.entries(ALGORITHMS).map(([k, a]) => [k, a.label]), algo)}</div>
    </div>
    <div class="controls" style="margin-bottom:0">
      <label class="field">Times P0 enters<input id="r0" type="number" min="1" max="3" value="${rounds[0]}"></label>
      <label class="field">Times P1 enters<input id="r1" type="number" min="1" max="3" value="${rounds[1]}"></label>
    </div>
  </div>
  <div class="card" id="out"></div>
  <div class="card" id="all"></div>`;

  const run = () => {
    const r = checkAlgorithm(algo, { rounds });
    const trace = r.violationTrace || r.stuckTrace;
    $(root, '#out').innerHTML = `
      <div class="grid2">
        <div>
          <h2>${esc(r.label)}</h2>
          <p class="sub">Code run by process i (j is the other process):</p>
          <pre class="code">${r.code.map((l) => esc(l)).join('\n')}</pre>
        </div>
        <div>
          ${tiles([[r.statesExplored, 'states explored'], [r.expected, 'expected final counter'], [r.finalCounters.length ? r.finalCounters.join(', ') : '—', 'possible final counters']])}
          <div class="stack">
            <div>${badge(r.mutualExclusion, 'Mutual exclusion holds', 'Mutual exclusion violated: both can be in the critical section')}</div>
            <div>${badge(r.progress, 'Progress: every run can finish', 'Progress violated: a run can get stuck forever')}</div>
            <div>${badge(!r.lostUpdates, 'No lost updates', 'Lost updates: the counter can end lower than expected')}</div>
          </div>
        </div>
      </div>
      ${trace ? `<h3>${r.violationTrace ? 'Shortest interleaving that breaks mutual exclusion' : 'Shortest run that gets stuck'}</h3>
        ${trace.length ? `<div class="trace">${table([{ label: '#', num: true, render: (_, i) => i + 1 }, { key: 'proc', label: 'Process' }, { key: 'action', label: 'Executes' }, { key: 'counter', label: 'counter', num: true }], trace)}</div>` : '<p class="note">Both threads start directly in the critical section: there is no entry section at all.</p>'}
        ${r.stuckTrace && !r.violationTrace ? `<p class="note">After these steps the process still waiting can only spin: the other process has finished and will never hand the turn back.</p>` : ''}` : ''}
      ${explain(algo)}`;

    const all = checkAll({ rounds });
    $(root, '#all').innerHTML = `<h2>All solutions (P0 enters ${rounds[0]}×, P1 enters ${rounds[1]}×)</h2>
      ${table([
        { key: 'label', label: 'Solution' },
        { key: 'statesExplored', label: 'States', num: true },
        { label: 'Mutual exclusion', render: (x) => badge(x.mutualExclusion, 'holds', 'violated') },
        { label: 'Progress', render: (x) => badge(x.progress, 'holds', 'violated') },
        { label: 'Final counter values', render: (x) => esc(x.finalCounters.join(', ') || 'never finishes') },
      ], all)}`;
  };

  onSegment(root, 'algo', (v) => { algo = v; run(); });
  const setRounds = () => { rounds = [Number($(root, '#r0').value) || 1, Number($(root, '#r1').value) || 1].map((x) => Math.min(3, Math.max(1, x))); run(); };
  $(root, '#r0').addEventListener('input', setRounds);
  $(root, '#r1').addEventListener('input', setRounds);
  run();
}

function explain(a) {
  const text = {
    none: 'Without an entry section the read and the write of different threads interleave, so one increment overwrites the other. This is a race condition: the result depends on timing.',
    lock: 'Checking the lock and setting it are two separate steps. Both threads can read lock == 0 before either writes 1, so both enter. A software lock variable needs an atomic test-and-set to work.',
    strict: 'Mutual exclusion holds, but progress does not: the threads must alternate. If P0 only needs the critical section once, P1 waits forever for a turn P0 will never give back.',
    peterson: 'flag[] says who wants to enter and turn breaks ties. Mutual exclusion, progress and bounded waiting all hold for two processes, assuming memory is sequentially consistent.',
    bakery: 'Each process takes a ticket one higher than the largest it sees and the lowest (ticket, id) pair goes first. choosing[] stops a process comparing against a ticket that is still being written. It works for n processes without any atomic hardware instruction.',
    tsl: 'TestAndSet reads the old value and sets the lock in one atomic hardware instruction, so the race in the plain lock variable disappears. It busy-waits and does not guarantee bounded waiting.',
    semaphore: 'wait() and signal() are atomic and a waiting process is blocked rather than spinning, so no CPU time is wasted. This is what the repository code uses (Python threading.Lock / semaphores).',
  }[a];
  return `<div class="callout">${esc(text)}</div>`;
}
