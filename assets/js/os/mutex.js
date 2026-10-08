// Critical-section solutions for two processes, checked by exhaustive
// state-space search (Unit 3: race condition, lock variable, strict alternation,
// Peterson, Lamport's Bakery, test-and-set lock, binary semaphore).
//
// Each process loops `rounds` times through: entry section -> critical section -> exit section.
// The critical section is the classic race: tmp = counter; counter = tmp + 1
// (two separate steps, so an interleaving inside it loses an update).
// Every step below is one atomic machine action. The checker explores EVERY
// interleaving of the two processes and reports:
//   - mutual exclusion: can both be inside the critical section at once?
//   - progress:        can the system reach a state from which it can never finish?
//   - the possible final values of the shared counter (expected = total rounds).

const DONE = 'done';

function clone(s) {
  return { pc: [...s.pc], rounds: [...s.rounds], sh: JSON.parse(JSON.stringify(s.sh)), loc: s.loc.map((l) => ({ ...l })) };
}

// Helper shared by every algorithm: the two critical-section steps.
function csStep(s, i, cs1, cs2, after) {
  if (s.pc[i] === cs1) { s.loc[i].tmp = s.sh.counter; s.pc[i] = cs2; return true; }
  if (s.pc[i] === cs2) { s.sh.counter = s.loc[i].tmp + 1; s.pc[i] = after; return true; }
  return false;
}
function finishRound(s, i) {
  s.rounds[i]--;
  s.pc[i] = s.rounds[i] > 0 ? 0 : DONE;
}

export const ALGORITHMS = {
  none: {
    label: 'No synchronisation',
    code: ['tmp = counter        // no entry section', 'counter = tmp + 1', '// no exit section'],
    init: () => ({ counter: 0 }),
    cs: [0, 1],
    step(s, i) {
      if (csStep(s, i, 0, 1, 2)) return;
      finishRound(s, i);
    },
  },
  lock: {
    label: 'Lock variable',
    code: ['while (lock == 1) ;   // read lock', 'lock = 1             // set lock', 'tmp = counter', 'counter = tmp + 1', 'lock = 0'],
    init: () => ({ counter: 0, lock: 0 }),
    cs: [2, 3],
    step(s, i) {
      const pc = s.pc[i];
      if (pc === 0) { if (s.sh.lock === 0) s.pc[i] = 1; return; }
      if (pc === 1) { s.sh.lock = 1; s.pc[i] = 2; return; }
      if (csStep(s, i, 2, 3, 4)) return;
      s.sh.lock = 0; finishRound(s, i);
    },
  },
  strict: {
    label: 'Strict alternation',
    code: ['while (turn != i) ;', 'tmp = counter', 'counter = tmp + 1', 'turn = j'],
    init: () => ({ counter: 0, turn: 0 }),
    cs: [1, 2],
    step(s, i) {
      const pc = s.pc[i];
      if (pc === 0) { if (s.sh.turn === i) s.pc[i] = 1; return; }
      if (csStep(s, i, 1, 2, 3)) return;
      s.sh.turn = 1 - i; finishRound(s, i);
    },
  },
  peterson: {
    label: "Peterson's solution",
    code: ['flag[i] = true', 'turn = j', 'while (flag[j] && turn == j) ;', 'tmp = counter', 'counter = tmp + 1', 'flag[i] = false'],
    init: () => ({ counter: 0, flag: [false, false], turn: 0 }),
    cs: [3, 4],
    step(s, i) {
      const j = 1 - i;
      const pc = s.pc[i];
      if (pc === 0) { s.sh.flag[i] = true; s.pc[i] = 1; return; }
      if (pc === 1) { s.sh.turn = j; s.pc[i] = 2; return; }
      if (pc === 2) { if (!(s.sh.flag[j] && s.sh.turn === j)) s.pc[i] = 3; return; }
      if (csStep(s, i, 3, 4, 5)) return;
      s.sh.flag[i] = false; finishRound(s, i);
    },
  },
  bakery: {
    label: "Lamport's Bakery",
    code: ['choosing[i] = true', 'm = number[j]        // read the other ticket', 'number[i] = m + 1    // take a higher ticket', 'choosing[i] = false', 'while (choosing[j]) ;', 'while (number[j] != 0 && (number[j], j) < (number[i], i)) ;', 'tmp = counter', 'counter = tmp + 1', 'number[i] = 0'],
    init: () => ({ counter: 0, choosing: [false, false], number: [0, 0] }),
    cs: [6, 7],
    step(s, i) {
      const j = 1 - i;
      const pc = s.pc[i];
      if (pc === 0) { s.sh.choosing[i] = true; s.pc[i] = 1; return; }
      if (pc === 1) { s.loc[i].m = s.sh.number[j]; s.pc[i] = 2; return; }
      if (pc === 2) { s.sh.number[i] = s.loc[i].m + 1; s.pc[i] = 3; return; }
      if (pc === 3) { s.sh.choosing[i] = false; s.pc[i] = 4; return; }
      if (pc === 4) { if (!s.sh.choosing[j]) s.pc[i] = 5; return; }
      if (pc === 5) {
        const nj = s.sh.number[j];
        const ni = s.sh.number[i];
        if (!(nj !== 0 && (nj < ni || (nj === ni && j < i)))) s.pc[i] = 6;
        return;
      }
      if (csStep(s, i, 6, 7, 8)) return;
      s.sh.number[i] = 0; finishRound(s, i);
    },
  },
  tsl: {
    label: 'Test-and-set lock (TSL)',
    code: ['while (TestAndSet(&lock)) ;  // atomic: old = lock; lock = 1', 'tmp = counter', 'counter = tmp + 1', 'lock = 0'],
    init: () => ({ counter: 0, lock: 0 }),
    cs: [1, 2],
    step(s, i) {
      const pc = s.pc[i];
      if (pc === 0) { const old = s.sh.lock; s.sh.lock = 1; if (old === 0) s.pc[i] = 1; return; }
      if (csStep(s, i, 1, 2, 3)) return;
      s.sh.lock = 0; finishRound(s, i);
    },
  },
  semaphore: {
    label: 'Binary semaphore (wait/signal)',
    code: ['wait(mutex)          // blocks (no busy waiting) if mutex == 0', 'tmp = counter', 'counter = tmp + 1', 'signal(mutex)'],
    init: () => ({ counter: 0, mutex: 1, blocked: [] }),
    cs: [1, 2],
    // A blocked process has no enabled step; signal() hands the semaphore straight to it.
    enabled: (s, i) => !s.sh.blocked.includes(i),
    step(s, i) {
      const pc = s.pc[i];
      if (pc === 0) { if (s.sh.mutex === 1) { s.sh.mutex = 0; s.pc[i] = 1; } else s.sh.blocked.push(i); return; }
      if (csStep(s, i, 1, 2, 3)) return;
      if (s.sh.blocked.length) { const w = s.sh.blocked.shift(); s.pc[w] = 1; } else s.sh.mutex = 1;
      finishRound(s, i);
    },
  },
};

const key = (s) => JSON.stringify(s);

export function checkAlgorithm(name, { rounds = [1, 2] } = {}) {
  const algo = ALGORITHMS[name];
  const start = { pc: [0, 0], rounds: [...rounds], sh: algo.init(), loc: [{}, {}] };
  const startKey = key(start);
  const states = new Map([[startKey, { state: start, parent: null, move: null }]]);
  const edges = new Map();
  const queue = [startKey];
  let violation = null;
  const finals = new Set();
  const inCS = (s, i) => algo.cs.includes(s.pc[i]);
  while (queue.length) {
    const k = queue.shift();
    const { state } = states.get(k);
    const out = [];
    if (!violation && inCS(state, 0) && inCS(state, 1)) violation = k;
    if (state.pc[0] === DONE && state.pc[1] === DONE) finals.add(state.sh.counter);
    for (const i of [0, 1]) {
      if (state.pc[i] === DONE) continue;
      if (algo.enabled && !algo.enabled(state, i)) continue;
      const n = clone(state);
      algo.step(n, i);
      const nk = key(n);
      out.push(nk);
      if (!states.has(nk)) { states.set(nk, { state: n, parent: k, move: { proc: i, pc: state.pc[i] } }); queue.push(nk); }
    }
    edges.set(k, out);
  }
  // Progress: every reachable state must be able to reach a state where both are done.
  const reverse = new Map();
  for (const [k, outs] of edges) for (const o of outs) { if (!reverse.has(o)) reverse.set(o, []); reverse.get(o).push(k); }
  const good = new Set();
  const stack = [];
  for (const [k, v] of states) if (v.state.pc[0] === DONE && v.state.pc[1] === DONE) { good.add(k); stack.push(k); }
  while (stack.length) for (const p of reverse.get(stack.pop()) || []) if (!good.has(p)) { good.add(p); stack.push(p); }
  // Report the nearest dead end: a state whose only moves are busy-waiting in place.
  let stuck = null;
  for (const k of states.keys()) if (!good.has(k) && edges.get(k).every((o) => o === k)) { stuck = k; break; }
  if (!stuck) for (const k of states.keys()) if (!good.has(k)) { stuck = k; break; }

  const total = rounds[0] + rounds[1];
  const trace = (k) => {
    const steps = [];
    while (k && states.get(k).parent) { const { move, state } = states.get(k); steps.unshift({ proc: move.proc, line: move.pc, after: state }); k = states.get(k).parent; }
    return steps.map((st) => ({ proc: `P${st.proc}`, action: algo.code[st.line] ?? 'exit', counter: st.after.sh.counter }));
  };
  return {
    name,
    label: algo.label,
    code: algo.code,
    statesExplored: states.size,
    mutualExclusion: !violation,
    progress: !stuck,
    finalCounters: [...finals].sort((a, b) => a - b),
    expected: total,
    lostUpdates: [...finals].some((v) => v !== total),
    violationTrace: violation ? trace(violation) : null,
    stuckTrace: stuck ? trace(stuck) : null,
  };
}

export function checkAll(opts) {
  return Object.keys(ALGORITHMS).map((n) => checkAlgorithm(n, opts));
}
