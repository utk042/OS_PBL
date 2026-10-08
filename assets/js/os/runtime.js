// A small concurrency runtime used by the classical synchronisation problems (Unit 3).
// Processes are generator functions. Every `yield` is a point where the
// scheduler may switch to another process, so the seeded scheduler produces a
// real interleaving. Supported operations:
//   yield P(sem) / yield V(sem)                 counting or binary semaphore
//   yield enter(mon) / yield exit(mon)          monitor entry / exit
//   yield wait(mon, 'cond') / yield signal(mon, 'cond')   condition variables (Mesa semantics)
//   yield step('label')                         a plain preemption point, recorded in the trace
//   yield sleep(n)                              do nothing for n clock ticks
// If no process can run and none is sleeping while some are blocked, it is a deadlock.
// Hitting maxSteps without finishing means livelock or starvation (e.g. a corrupted busy-wait).

import { makeRng } from './rng.js';

export const P = (s) => ({ op: 'P', s });
export const V = (s) => ({ op: 'V', s });
export const enter = (m) => ({ op: 'P', s: m.mutex, monitor: true });
export const exit = (m) => ({ op: 'V', s: m.mutex, monitor: true });
export const wait = (m, c) => ({ op: 'wait', m, c });
export const signal = (m, c) => ({ op: 'signal', m, c });
export const step = (label) => ({ op: 'step', label });
export const sleep = (n) => ({ op: 'sleep', n });

export class Sim {
  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.procs = [];
    this.clock = 0;
    this.trace = [];
    this.deadlock = null;
  }

  semaphore(name, value) {
    return { name, value, queue: [] };
  }

  monitor(name, conds = []) {
    const m = { name, mutex: this.semaphore(`${name}.mutex`, 1), conds: {} };
    for (const c of conds) m.conds[c] = [];
    return m;
  }

  // A daemon (e.g. the barber) may still be blocked when the run ends; that is not a deadlock.
  spawn(name, genFn, { daemon = false } = {}) {
    const proc = { name, gen: null, pending: null, state: 'ready', wakeAt: 0, blockedOn: null, daemon };
    proc.gen = genFn(proc);
    this.procs.push(proc);
    this.#resume(proc);
    return proc;
  }

  log(proc, kind, detail = '') {
    this.trace.push({ t: this.clock, proc: proc ? proc.name : '-', kind, detail });
  }

  #resume(proc) {
    const r = proc.gen.next();
    if (r.done) { proc.state = 'done'; proc.pending = null; return; }
    proc.pending = r.value;
    proc.state = 'ready';
  }

  #block(proc, sem) {
    proc.state = 'blocked';
    proc.blockedOn = sem.name;
    sem.queue.push(proc);
  }

  // Execute the pending operation of one process.
  #exec(proc) {
    const op = proc.pending;
    switch (op.op) {
      case 'P':
        if (op.s.value > 0) { op.s.value--; this.#resume(proc); }
        else { this.#block(proc, op.s); this.log(proc, 'block', op.s.name); }
        break;
      case 'V':
        if (op.s.queue.length) {
          const w = op.s.queue.shift();
          w.blockedOn = null;
          w.pending = { op: 'resume' };
          w.state = 'ready';
          this.log(proc, 'wake', `${w.name} (${op.s.name})`);
        } else op.s.value++;
        this.#resume(proc);
        break;
      case 'wait': {
        // Release the monitor and sleep on the condition; when signalled, re-acquire the monitor first.
        const q = op.m.conds[op.c];
        proc.state = 'blocked';
        proc.blockedOn = `${op.m.name}.${op.c}`;
        q.push(proc);
        this.log(proc, 'wait', `${op.m.name}.${op.c}`);
        const mx = op.m.mutex;
        if (mx.queue.length) { const w = mx.queue.shift(); w.blockedOn = null; w.pending = { op: 'resume' }; w.state = 'ready'; }
        else mx.value++;
        break;
      }
      case 'signal': {
        const q = op.m.conds[op.c];
        if (q.length) {
          const w = q.shift();
          w.blockedOn = null;
          w.pending = { op: 'P', s: op.m.mutex, monitor: true, afterWait: true };
          w.state = 'ready';
          this.log(proc, 'signal', `${op.m.name}.${op.c} -> ${w.name}`);
        }
        this.#resume(proc);
        break;
      }
      case 'sleep':
        proc.state = 'sleeping';
        proc.wakeAt = this.clock + op.n;
        proc.pending = { op: 'resume' };
        break;
      case 'step':
        this.log(proc, 'step', op.label);
        this.#resume(proc);
        break;
      case 'resume':
        this.#resume(proc);
        break;
      default:
        throw new Error(`unknown op ${op.op}`);
    }
  }

  run(maxSteps = 20000) {
    let steps = 0;
    while (steps < maxSteps) {
      for (const p of this.procs) if (p.state === 'sleeping' && p.wakeAt <= this.clock) p.state = 'ready';
      const ready = this.procs.filter((p) => p.state === 'ready');
      if (!ready.length) {
        const sleeping = this.procs.filter((p) => p.state === 'sleeping');
        if (sleeping.length) { this.clock = Math.min(...sleeping.map((p) => p.wakeAt)); continue; }
        const blocked = this.procs.filter((p) => p.state === 'blocked');
        if (blocked.some((p) => !p.daemon)) {
          this.deadlock = blocked.map((p) => ({ proc: p.name, waitingFor: p.blockedOn }));
          this.log(null, 'deadlock', blocked.map((p) => `${p.name} waits on ${p.blockedOn}`).join('; '));
        }
        break;
      }
      this.#exec(this.rng.pick(ready));
      this.clock++;
      steps++;
    }
    return { steps, clock: this.clock, deadlock: this.deadlock, trace: this.trace, finished: this.procs.every((p) => p.daemon || p.state === 'done') };
  }
}
