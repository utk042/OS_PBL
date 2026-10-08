// Threads and multithreading models (Unit 2).
// The repository server handles N concurrent requests. Each request is
// CPU (parse) -> I/O (read file from disk) -> CPU (build response).
// We compare how long the batch takes under each way of mapping the work onto
// kernel-schedulable entities, on `cores` CPU cores, with optional Hyper-Threading.

export const MODELS = {
  single:       'Single-threaded process (one request at a time)',
  process:      'Process per request (fork)',
  manyToOne:    'Many-to-one (user threads on 1 kernel thread)',
  oneToOne:     'One-to-one (kernel thread per user thread)',
  manyToMany:   'Many-to-many (user threads on a pool of kernel threads)',
};

export function makeRequests(n = 12, { cpu1 = 2, io = 6, cpu2 = 1 } = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, phases: [['cpu', cpu1], ['io', io], ['cpu', cpu2]] }));
}

// Costs in the same time unit as the phases.
const PROCESS_CREATE = 1.5; // fork + exec + address space set-up per request
const THREAD_CREATE = 0.2;  // creating a kernel thread
const HT_SPEED = 0.65;      // speed of each logical CPU when both siblings on a core are busy (1.3x per core)

// Kernel memory per schedulable entity (KB) - a process needs its own page tables and PCB,
// a kernel thread needs a TCB and kernel stack.
const MEM = { process: 1024, kthread: 16 };

export function simulateThreads(model, { requests = makeRequests(), cores = 4, hyperThreading = false, poolSize = 4, dt = 0.1 } = {}) {
  const tasks = requests.map((r) => ({ id: r.id, phases: r.phases.map((p) => [...p]), phase: 0, done: null, setup: 0 }));
  if (model === 'process') tasks.forEach((t) => (t.setup = PROCESS_CREATE));
  if (model === 'oneToOne') tasks.forEach((t) => (t.setup = THREAD_CREATE));

  const logical = hyperThreading ? cores * 2 : cores;
  let kernelEntities;
  if (model === 'single' || model === 'manyToOne') kernelEntities = 1;
  else if (model === 'manyToMany') kernelEntities = Math.min(poolSize, tasks.length);
  else kernelEntities = tasks.length;

  let t = 0;
  let cpuBusy = 0;
  const kind = (task) => (task.setup > 0 ? 'cpu' : task.phases[task.phase] ? task.phases[task.phase][0] : null);
  const order = [...tasks];
  while (tasks.some((x) => x.done === null) && t < 10000) {
    const live = order.filter((x) => x.done === null);
    // Phases are read once per tick so a task cannot finish CPU and start I/O in the same tick.
    const wantCpu = live.filter((x) => kind(x) === 'cpu');
    const inIo = live.filter((x) => kind(x) === 'io');
    let running = [];
    if (model === 'single') {
      // Strictly serial: the oldest unfinished request owns the process, I/O included.
      const head = live[0];
      running = kind(head) === 'cpu' ? [head] : [];
    } else if (model === 'manyToOne') {
      // One kernel thread: if the running user thread blocks in I/O the whole process blocks.
      const head = live[0];
      running = kind(head) === 'cpu' ? [head] : [];
    } else if (model === 'manyToMany') {
      // Scheduler activations: a user thread that blocks gives its kernel thread back.
      running = wantCpu.slice(0, Math.min(kernelEntities, logical));
    } else {
      running = wantCpu.slice(0, logical);
    }
    // With Hyper-Threading, threads are spread one per core first; only cores whose
    // two logical CPUs are both busy run each thread at HT_SPEED.
    const pairs = hyperThreading ? Math.max(0, running.length - cores) : 0;
    running.forEach((x, i) => {
      const s = i < pairs * 2 ? HT_SPEED : 1;
      advance(x, s * dt);
      cpuBusy += s * dt;
    });
    const blockedSerial = model === 'single' || model === 'manyToOne';
    // I/O progresses in parallel (the disk queue is not the bottleneck here).
    for (const x of inIo) {
      if (blockedSerial && x !== live[0]) continue; // the others never got to issue their I/O
      advance(x, dt);
    }
    t += dt;
    for (const x of live) if (x.done === null && !x.phases[x.phase] && x.setup <= 1e-9) x.done = t;
  }
  const finish = tasks.map((x) => x.done);
  const makespan = Math.max(...finish);
  const avgResponse = finish.reduce((s, v) => s + v, 0) / finish.length;
  const memory = model === 'process' ? tasks.length * MEM.process : 1 * MEM.process + kernelEntities * MEM.kthread;
  return { model, makespan: round(makespan), avgResponse: round(avgResponse), kernelEntities, memoryKB: memory, cpuWork: round(cpuBusy) };

  function advance(x, amount) {
    if (x.setup > 0) { x.setup = Math.max(0, x.setup - amount); return; }
    const p = x.phases[x.phase];
    p[1] -= amount;
    if (p[1] <= 1e-9) x.phase++;
  }
}

const round = (v) => Math.round(v * 10) / 10;

export function compareThreadModels(opts) {
  return Object.keys(MODELS).map((m) => ({ ...simulateThreads(m, opts), label: MODELS[m] }));
}
