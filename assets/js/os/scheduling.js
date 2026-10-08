// CPU scheduling algorithms (Unit 2).
// Every algorithm is simulated one time unit at a time and returns a timeline
// (which job ran in each unit, or null when the CPU is idle). summarize() turns
// the timeline into Gantt segments and the per-job metrics.
//
// A job is { id, name, arrival, burst, priority, queue }.
//   priority: smaller number = higher priority.
//   queue:    'system' | 'interactive' | 'batch' (used by the multilevel queue).

export const QUEUES = ['system', 'interactive', 'batch'];

// The background-job workload of the Digital Research Repository. Short
// interactive requests (search, download) arrive while long batch jobs
// (OCR, indexing, thumbnails, backup) are already in the queue.
export const REPOSITORY_WORKLOAD = [
  { id: 'J1', name: 'OCR scanned thesis',      arrival: 0,  burst: 9, priority: 4, queue: 'batch' },
  { id: 'J2', name: 'Search "deadlock"',       arrival: 1,  burst: 2, priority: 1, queue: 'interactive' },
  { id: 'J3', name: 'Build full-text index',   arrival: 2,  burst: 7, priority: 3, queue: 'batch' },
  { id: 'J4', name: 'Download report PDF',     arrival: 3,  burst: 1, priority: 1, queue: 'interactive' },
  { id: 'J5', name: 'Nightly backup (admin)',  arrival: 4,  burst: 5, priority: 2, queue: 'system' },
  { id: 'J6', name: 'Extract metadata',        arrival: 6,  burst: 3, priority: 3, queue: 'batch' },
  { id: 'J7', name: 'Search "paging"',         arrival: 8,  burst: 2, priority: 1, queue: 'interactive' },
  { id: 'J8', name: 'Generate thumbnails',     arrival: 10, burst: 4, priority: 4, queue: 'batch' },
];

const byArrival = (a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id, undefined, { numeric: true });

function prepare(jobs) {
  return jobs.map((j) => ({ ...j, remaining: j.burst })).sort(byArrival);
}

function allDone(js) {
  return js.every((j) => j.remaining === 0);
}

// Non-preemptive: once a job is picked it runs to completion.
function nonPreemptive(jobs, key) {
  const js = prepare(jobs);
  const timeline = [];
  let t = 0;
  while (!allDone(js)) {
    const ready = js.filter((j) => j.remaining > 0 && j.arrival <= t);
    if (!ready.length) { timeline.push(null); t++; continue; }
    ready.sort((a, b) => key(a) - key(b) || byArrival(a, b));
    const job = ready[0];
    while (job.remaining > 0) { timeline.push(job.id); job.remaining--; t++; }
  }
  return timeline;
}

// Preemptive by key: at every time unit run the ready job with the smallest key.
// A running job keeps the CPU on ties so equal keys do not cause needless switches.
function preemptiveByKey(jobs, key) {
  const js = prepare(jobs);
  const timeline = [];
  let t = 0;
  let current = null;
  while (!allDone(js)) {
    const ready = js.filter((j) => j.remaining > 0 && j.arrival <= t);
    if (!ready.length) { timeline.push(null); t++; current = null; continue; }
    ready.sort((a, b) => key(a) - key(b) || (a === current ? -1 : b === current ? 1 : byArrival(a, b)));
    current = ready[0];
    timeline.push(current.id);
    current.remaining--;
    t++;
  }
  return timeline;
}

export const fcfs = (jobs) => nonPreemptive(jobs, (j) => j.arrival);
export const sjf = (jobs) => nonPreemptive(jobs, (j) => j.burst);
export const priorityNP = (jobs) => nonPreemptive(jobs, (j) => j.priority);
export const srtf = (jobs) => preemptiveByKey(jobs, (j) => j.remaining);
export const priorityP = (jobs) => preemptiveByKey(jobs, (j) => j.priority);

// Round Robin. Convention: jobs arriving at time t join the ready queue before
// a job whose quantum expired at time t is put back at the tail.
export function roundRobin(jobs, quantum = 2) {
  const js = prepare(jobs);
  const timeline = [];
  const queue = [];
  let next = 0;
  let t = 0;
  let current = null;
  let used = 0;
  const admit = () => { while (next < js.length && js[next].arrival <= t) queue.push(js[next++]); };
  while (!allDone(js)) {
    admit();
    if (current && used === quantum) { queue.push(current); current = null; }
    if (!current) { current = queue.shift() || null; used = 0; }
    if (!current) { timeline.push(null); t++; continue; }
    timeline.push(current.id);
    current.remaining--;
    used++;
    t++;
    if (current.remaining === 0) current = null;
  }
  return timeline;
}

// Multilevel Queue: fixed queues with strict priority between them
// (system > interactive > batch). A higher queue preempts a lower one.
// Inside a queue: system = FCFS, interactive = Round Robin, batch = FCFS.
export function multilevelQueue(jobs, { quantum = 2 } = {}) {
  const js = prepare(jobs);
  const timeline = [];
  const queues = { system: [], interactive: [], batch: [] };
  let next = 0;
  let t = 0;
  let current = null;
  let used = 0;
  const level = (j) => QUEUES.indexOf(j.queue || 'batch');
  while (!allDone(js)) {
    while (next < js.length && js[next].arrival <= t) { const j = js[next++]; queues[j.queue || 'batch'].push(j); }
    if (current) {
      const higher = QUEUES.slice(0, level(current)).some((q) => queues[q].length);
      const sliceOver = current.queue === 'interactive' && used === quantum;
      if (higher || sliceOver) {
        // A preempted batch/system job goes back to the head of its own queue (it was not done with its turn);
        // an interactive job whose slice ended goes to the tail (Round Robin).
        if (sliceOver) queues[current.queue].push(current); else queues[current.queue].unshift(current);
        current = null;
      }
    }
    if (!current) {
      const q = QUEUES.find((name) => queues[name].length);
      current = q ? queues[q].shift() : null;
      used = 0;
    }
    if (!current) { timeline.push(null); t++; continue; }
    timeline.push(current.id);
    current.remaining--;
    used++;
    t++;
    if (current.remaining === 0) current = null;
  }
  return timeline;
}

// Multilevel Feedback Queue: every job starts in the top queue. Using a whole
// quantum without finishing moves the job one level down. A job preempted by an
// arrival in a higher queue keeps its level. Optional periodic priority boost
// moves every job back to the top, which prevents starvation of long jobs.
export function mlfq(jobs, { quanta = [2, 4, Infinity], boost = 0 } = {}) {
  const js = prepare(jobs);
  const timeline = [];
  const levels = quanta.map(() => []);
  const levelOf = new Map();
  const levelTrace = [];
  let next = 0;
  let t = 0;
  let current = null;
  let used = 0;
  while (!allDone(js)) {
    while (next < js.length && js[next].arrival <= t) { const j = js[next++]; levelOf.set(j.id, 0); levels[0].push(j); }
    if (boost && t > 0 && t % boost === 0) {
      for (let l = 1; l < levels.length; l++) { for (const j of levels[l]) levelOf.set(j.id, 0); levels[0].push(...levels[l]); levels[l] = []; }
      if (current) { levelOf.set(current.id, 0); }
    }
    if (current) {
      const l = levelOf.get(current.id);
      if (used >= quanta[l]) {
        const nl = Math.min(l + 1, levels.length - 1);
        levelOf.set(current.id, nl);
        levels[nl].push(current);
        current = null;
      } else if (levels.slice(0, l).some((q) => q.length)) {
        levels[l].push(current);
        current = null;
      }
    }
    if (!current) {
      const l = levels.findIndex((q) => q.length);
      current = l >= 0 ? levels[l].shift() : null;
      used = 0;
    }
    if (!current) { timeline.push(null); levelTrace.push(null); t++; continue; }
    timeline.push(current.id);
    levelTrace.push(levelOf.get(current.id));
    current.remaining--;
    used++;
    t++;
    if (current.remaining === 0) current = null;
  }
  timeline.levels = levelTrace;
  return timeline;
}

export const ALGORITHMS = {
  fcfs:  { label: 'FCFS',                       preemptive: false, run: (j) => fcfs(j) },
  sjf:   { label: 'SJF (non-pre-emptive)',      preemptive: false, run: (j) => sjf(j) },
  srtf:  { label: 'SRTF',                       preemptive: true,  run: (j) => srtf(j) },
  pnp:   { label: 'Priority (non-pre-emptive)', preemptive: false, run: (j) => priorityNP(j) },
  pp:    { label: 'Priority (pre-emptive)',     preemptive: true,  run: (j) => priorityP(j) },
  rr:    { label: 'Round Robin',                preemptive: true,  run: (j, o) => roundRobin(j, o.quantum) },
  mlq:   { label: 'Multilevel Queue',           preemptive: true,  run: (j, o) => multilevelQueue(j, o) },
  mlfq:  { label: 'Multilevel Feedback Queue',  preemptive: true,  run: (j, o) => mlfq(j, { quanta: [o.quantum, o.quantum * 2, Infinity], boost: o.boost || 0 }) },
};

export function summarize(jobs, timeline) {
  const segments = [];
  for (let t = 0; t < timeline.length; t++) {
    const id = timeline[t];
    const last = segments[segments.length - 1];
    if (last && last.id === id) last.end = t + 1;
    else segments.push({ id, start: t, end: t + 1, level: timeline.levels ? timeline.levels[t] : undefined });
  }
  const rows = jobs.map((j) => {
    const first = timeline.indexOf(j.id);
    const completion = timeline.lastIndexOf(j.id) + 1;
    const turnaround = completion - j.arrival;
    return { ...j, start: first, completion, turnaround, waiting: turnaround - j.burst, response: first - j.arrival };
  });
  const busy = timeline.filter((x) => x !== null).length;
  const runs = segments.filter((s) => s.id !== null);
  let switches = 0;
  for (let i = 1; i < runs.length; i++) if (runs[i].id !== runs[i - 1].id) switches++;
  const avg = (k, list = rows) => (list.length ? list.reduce((s, r) => s + r[k], 0) / list.length : 0);
  const interactive = rows.filter((r) => r.queue === 'interactive');
  return {
    segments,
    rows,
    makespan: timeline.length,
    utilization: timeline.length ? busy / timeline.length : 0,
    contextSwitches: switches,
    avgWaiting: avg('waiting'),
    avgTurnaround: avg('turnaround'),
    avgResponse: avg('response'),
    maxWaiting: Math.max(...rows.map((r) => r.waiting)),
    interactiveResponse: avg('response', interactive),
    throughput: timeline.length ? jobs.length / timeline.length : 0,
  };
}

export function schedule(algo, jobs, opts = {}) {
  const o = { quantum: 2, ...opts };
  return summarize(jobs, ALGORITHMS[algo].run(jobs, o));
}

export function compareAll(jobs, opts = {}) {
  return Object.keys(ALGORITHMS).map((k) => ({ key: k, label: ALGORITHMS[k].label, ...schedule(k, jobs, opts) }));
}
