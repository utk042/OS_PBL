// Real-time scheduling for the Unit 2 case study (embedded systems / RTOS).
// Periodic task: { id, name, C (execution time), T (period), D (relative deadline, defaults to T) }.
// Jobs are released at k*T; a job that has not finished by its deadline is a
// miss and is dropped (firm real-time), as an RTOS watchdog would do.

// Embedded controller of the library's thesis-scanning kiosk that feeds the repository.
export const KIOSK_TASKS = [
  { id: 'T1', name: 'Sensor/page-turn control', C: 1, T: 4 },
  { id: 'T2', name: 'Camera capture',          C: 2, T: 8 },
  { id: 'T3', name: 'Image compression',       C: 3, T: 16 },
  { id: 'T4', name: 'Upload to repository',    C: 2, T: 16 },
];
// Utilization 0.95: above the Liu-Layland bound, Rate Monotonic misses and EDF does not.
export const OVERLOADED_TASKS = [
  { id: 'T1', name: 'Motor control',    C: 2, T: 5 },
  { id: 'T2', name: 'Camera capture',   C: 4, T: 9 },
  { id: 'T3', name: 'Network upload',   C: 1, T: 7 },
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const hyperperiod = (tasks) => tasks.reduce((l, t) => (l * t.T) / gcd(l, t.T), 1);
export const utilization = (tasks) => tasks.reduce((s, t) => s + t.C / t.T, 0);
export const liuLaylandBound = (n) => n * (Math.pow(2, 1 / n) - 1);

// Exact Rate Monotonic test: worst-case response time R = C + sum(ceil(R/Tj) * Cj) over higher-priority tasks.
export function responseTimeAnalysis(tasks) {
  const sorted = [...tasks].sort((a, b) => a.T - b.T);
  return sorted.map((task, i) => {
    const hp = sorted.slice(0, i);
    let R = task.C;
    for (let iter = 0; iter < 1000; iter++) {
      const next = task.C + hp.reduce((s, h) => s + Math.ceil(R / h.T) * h.C, 0);
      if (next === R || next > (task.D ?? task.T)) { R = next; break; }
      R = next;
    }
    return { id: task.id, R, D: task.D ?? task.T, ok: R <= (task.D ?? task.T) };
  });
}

// policy: 'rm' (shorter period = higher priority), 'dm' (shorter deadline), 'edf' (earliest absolute deadline).
export function simulateRT(tasks, policy = 'rm', horizon = hyperperiod(tasks)) {
  const jobs = [];
  const timeline = [];
  const misses = [];
  const releases = [];
  let preemptions = 0;
  let last = null;
  for (let t = 0; t < horizon; t++) {
    for (const task of tasks) {
      if (t % task.T === 0) {
        const job = { task: task.id, release: t, deadline: t + (task.D ?? task.T), left: task.C, prio: policy === 'rm' ? task.T : task.D ?? task.T };
        jobs.push(job);
        releases.push({ task: task.id, t, deadline: job.deadline });
      }
    }
    for (const job of jobs) {
      if (job.left > 0 && !job.missed && t >= job.deadline) { job.missed = true; misses.push({ task: job.task, release: job.release, deadline: job.deadline }); }
    }
    const ready = jobs.filter((j) => j.left > 0 && !j.missed);
    ready.sort((a, b) => (policy === 'edf' ? a.deadline - b.deadline : a.prio - b.prio) || a.release - b.release || a.task.localeCompare(b.task));
    const run = ready[0] || null;
    if (last && last.left > 0 && !last.missed && run !== last) preemptions++;
    if (run) run.left--;
    timeline.push(run ? run.task : null);
    last = run;
  }
  // Jobs still unfinished whose deadline is exactly the end of the horizon.
  for (const job of jobs) {
    if (job.left > 0 && !job.missed && job.deadline <= horizon) { job.missed = true; misses.push({ task: job.task, release: job.release, deadline: job.deadline }); }
  }
  const completed = jobs.filter((j) => j.left === 0).length;
  return { timeline, misses, releases, preemptions, completed, jobs: jobs.length, horizon };
}

// Priority inversion (Mars Pathfinder style). Each task runs a script of steps:
//   ['cpu', n]  compute for n units     ['lock', R] / ['unlock', R]  binary semaphore
// protocol: 'none' or 'inherit' (priority inheritance: a lock holder runs at the
// highest priority of the tasks it blocks).
export const INVERSION_SCENARIO = [
  { id: 'L', name: 'Low: log writer',      prio: 3, arrival: 0, script: [['cpu', 1], ['lock', 'bus'], ['cpu', 3], ['unlock', 'bus'], ['cpu', 1]] },
  { id: 'M', name: 'Medium: compression',  prio: 2, arrival: 2, script: [['cpu', 6]] },
  { id: 'H', name: 'High: sensor handler', prio: 1, arrival: 1, script: [['cpu', 1], ['lock', 'bus'], ['cpu', 1], ['unlock', 'bus']] },
];

export function simulateInversion(scenario = INVERSION_SCENARIO, protocol = 'none', limit = 60) {
  const tasks = scenario.map((s) => ({ ...s, pc: 0, left: s.script[0][0] === 'cpu' ? s.script[0][1] : 0, done: false, finish: null, blockedOn: null }));
  const owner = {};
  const timeline = [];
  const effPrio = (task) => {
    if (protocol !== 'inherit') return task.prio;
    let p = task.prio;
    for (const other of tasks) if (other.blockedOn && owner[other.blockedOn] === task.id) p = Math.min(p, effPrio(other));
    return p;
  };
  // Execute zero-time steps (lock/unlock) until the task reaches a cpu step, blocks or ends.
  const advance = (task) => {
    while (!task.done) {
      const step = task.script[task.pc];
      if (!step) { task.done = true; break; }
      if (step[0] === 'cpu') { if (task.left > 0) return; task.pc++; const n = task.script[task.pc]; if (n && n[0] === 'cpu') task.left = n[1]; continue; }
      if (step[0] === 'lock') {
        if (owner[step[1]] && owner[step[1]] !== task.id) { task.blockedOn = step[1]; return; }
        owner[step[1]] = task.id; task.blockedOn = null; task.pc++;
      } else if (step[0] === 'unlock') { delete owner[step[1]]; task.pc++; }
      const n = task.script[task.pc];
      if (n && n[0] === 'cpu') task.left = n[1];
    }
  };
  for (let t = 0; t < limit && tasks.some((x) => !x.done); t++) {
    const arrived = tasks.filter((x) => x.arrival <= t && !x.done);
    arrived.forEach(advance);
    const ready = arrived.filter((x) => !x.done && !x.blockedOn && x.left > 0);
    ready.sort((a, b) => effPrio(a) - effPrio(b));
    const run = ready[0];
    if (run) { run.left--; timeline.push({ id: run.id, boosted: effPrio(run) !== run.prio, holds: Object.keys(owner).filter((r) => owner[r] === run.id) }); advance(run); if (run.done) run.finish = t + 1; }
    else timeline.push(null);
    for (const x of tasks) if (x.done && x.finish === null) x.finish = t + 1;
  }
  const result = {};
  for (const x of tasks) result[x.id] = { finish: x.finish, response: x.finish - x.arrival };
  return { timeline, result };
}
