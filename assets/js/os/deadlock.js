// Deadlock (Unit 3): characterisation, Banker's algorithm (avoidance),
// detection for multi-instance resources and wait-for graphs, and recovery.
//
// Resources of the repository server, each with several instances.
export const RESOURCES = ['DB connections', 'Worker threads', 'I/O buffers', 'Temp disk (GB)'];

// Textbook-sized example mapped onto repository jobs.
export const BANKER_EXAMPLE = {
  processes: ['Upload', 'Indexer', 'Backup', 'Search', 'Report gen'],
  available: [3, 3, 2, 2],
  max: [
    [7, 5, 3, 2],
    [3, 2, 2, 2],
    [9, 0, 2, 2],
    [2, 2, 2, 1],
    [4, 3, 3, 2],
  ],
  allocation: [
    [0, 1, 0, 0],
    [2, 0, 0, 1],
    [3, 0, 2, 1],
    [2, 1, 1, 0],
    [0, 0, 2, 0],
  ],
};

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const leq = (a, b) => a.every((x, i) => x <= b[i]);

export const need = (max, allocation) => max.map((row, i) => sub(row, allocation[i]));

// Safety algorithm: returns a safe sequence or the processes that can never finish.
export function isSafe(available, max, allocation) {
  const nd = need(max, allocation);
  const n = max.length;
  let work = [...available];
  const finish = new Array(n).fill(false);
  const sequence = [];
  const steps = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      if (!finish[i] && leq(nd[i], work)) {
        const before = work;
        work = add(work, allocation[i]);
        finish[i] = true;
        sequence.push(i);
        steps.push({ process: i, need: nd[i], workBefore: before, workAfter: work });
        progressed = true;
      }
    }
  }
  return { safe: finish.every(Boolean), sequence, steps, stuck: finish.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0) };
}

// Resource-request algorithm: grant only if the resulting state is still safe.
export function requestResources(state, pid, request) {
  const nd = need(state.max, state.allocation);
  if (!leq(request, nd[pid])) return { granted: false, reason: 'error: request exceeds the declared maximum need' };
  if (!leq(request, state.available)) return { granted: false, reason: 'must wait: not enough resources available now' };
  const next = {
    ...state,
    available: sub(state.available, request),
    allocation: state.allocation.map((row, i) => (i === pid ? add(row, request) : [...row])),
  };
  const safety = isSafe(next.available, next.max, next.allocation);
  if (!safety.safe) return { granted: false, reason: 'must wait: granting would leave the system in an unsafe state', safety };
  return { granted: true, reason: 'granted: the new state is safe', state: next, safety };
}

// Detection algorithm (several instances per resource type). `request` is the current outstanding request matrix.
export function detectDeadlock(available, allocation, request) {
  const n = allocation.length;
  let work = [...available];
  const finish = allocation.map((row) => row.every((x) => x === 0));
  let progressed = true;
  const order = [];
  while (progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      if (!finish[i] && leq(request[i], work)) { work = add(work, allocation[i]); finish[i] = true; order.push(i); progressed = true; }
    }
  }
  return { deadlocked: finish.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0), order };
}

// Recovery by process termination: abort the cheapest deadlocked process
// (cost = resources it holds, i.e. the work lost) and re-run detection until clear.
export function recover(available, allocation, request, cost = (i) => allocation[i].reduce((a, b) => a + b, 0)) {
  let avail = [...available];
  let alloc = allocation.map((r) => [...r]);
  let req = request.map((r) => [...r]);
  const victims = [];
  for (let guard = 0; guard < allocation.length; guard++) {
    const { deadlocked } = detectDeadlock(avail, alloc, req);
    if (!deadlocked.length) break;
    const victim = deadlocked.reduce((best, i) => (cost(i) < cost(best) ? i : best), deadlocked[0]);
    victims.push(victim);
    avail = add(avail, alloc[victim]);
    alloc[victim] = alloc[victim].map(() => 0);
    req[victim] = req[victim].map(() => 0);
  }
  return { victims, available: avail };
}

export const DETECTION_EXAMPLE = {
  processes: ['Upload', 'Indexer', 'Backup', 'Search', 'Report gen'],
  available: [0, 0, 0, 0],
  allocation: [
    [0, 1, 0, 1],
    [2, 0, 0, 0],
    [0, 0, 2, 1],
    [1, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  request: [
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ],
};

// Wait-for graph (single instance per resource): edges [from, to] meaning "from waits for to".
export function findCycle(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) adj.get(a).push(b);
  const color = new Map(nodes.map((n) => [n, 0]));
  const stack = [];
  let cycle = null;
  const dfs = (u) => {
    color.set(u, 1); stack.push(u);
    for (const v of adj.get(u)) {
      if (cycle) return;
      if (color.get(v) === 1) { cycle = stack.slice(stack.indexOf(v)); return; }
      if (color.get(v) === 0) dfs(v);
    }
    stack.pop(); color.set(u, 2);
  };
  for (const n of nodes) if (!cycle && color.get(n) === 0) dfs(n);
  return cycle;
}

// The four Coffman conditions for a given state, for the explanation panel.
export function coffman({ available, allocation, request }) {
  const holdsAndWaits = allocation.some((row, i) => row.some((x) => x > 0) && request[i].some((x) => x > 0));
  return {
    mutualExclusion: true, // DB connections, buffers and locks are non-shareable
    holdAndWait: holdsAndWaits,
    noPreemption: true,
    circularWait: detectDeadlock(available, allocation, request).deadlocked.length > 0,
  };
}
