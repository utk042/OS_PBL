// Classical synchronisation problems (Unit 3), each mapped onto the repository:
//   Bounded buffer      -> upload queue between uploader threads and indexer workers
//   Readers-writers     -> search requests (readers) and index updates (writers) on the search index
//   Dining philosophers -> indexer workers that each need two adjacent index shards locked
//   Sleeping barber     -> a single PDF-conversion worker with a limited waiting queue
import { Sim, P, V, enter, exit, wait, signal, step, sleep } from './runtime.js';

// ---------- Bounded buffer (producer-consumer) ----------
// impl: 'semaphore' | 'monitor' | 'unsynchronized'
export function boundedBuffer({ producers = 3, consumers = 2, size = 3, itemsEach = 4, impl = 'semaphore', seed = 1, maxSteps = 6000 } = {}) {
  const sim = new Sim(seed);
  const buf = new Array(size).fill(null);
  const st = { in: 0, out: 0, count: 0, produced: [], consumed: [], maxCount: 0, overflow: 0 };
  const total = producers * itemsEach;
  let taken = 0; // consumers claim items before taking them so they know when to stop

  if (impl === 'semaphore') {
    const empty = sim.semaphore('empty', size);
    const full = sim.semaphore('full', 0);
    const mutex = sim.semaphore('mutex', 1);
    for (let p = 0; p < producers; p++) sim.spawn(`Uploader${p + 1}`, function* () {
      for (let k = 0; k < itemsEach; k++) {
        const item = `doc${p + 1}.${k + 1}`;
        yield step(`prepare ${item}`);
        yield P(empty); yield P(mutex);
        buf[st.in] = item; st.in = (st.in + 1) % size; st.count++; st.produced.push(item);
        st.maxCount = Math.max(st.maxCount, st.count);
        yield step(`put ${item}`);
        yield V(mutex); yield V(full);
      }
    });
    for (let c = 0; c < consumers; c++) sim.spawn(`Indexer${c + 1}`, function* () {
      while (taken < total) {
        taken++;
        yield P(full); yield P(mutex);
        const item = buf[st.out]; buf[st.out] = null; st.out = (st.out + 1) % size; st.count--; st.consumed.push(item);
        yield step(`take ${item}`);
        yield V(mutex); yield V(empty);
        yield step(`index ${item}`);
      }
    });
  } else if (impl === 'monitor') {
    const m = sim.monitor('queue', ['notFull', 'notEmpty']);
    for (let p = 0; p < producers; p++) sim.spawn(`Uploader${p + 1}`, function* () {
      for (let k = 0; k < itemsEach; k++) {
        const item = `doc${p + 1}.${k + 1}`;
        yield step(`prepare ${item}`);
        yield enter(m);
        while (st.count === size) yield wait(m, 'notFull');
        buf[st.in] = item; st.in = (st.in + 1) % size; st.count++; st.produced.push(item);
        st.maxCount = Math.max(st.maxCount, st.count);
        yield signal(m, 'notEmpty');
        yield exit(m);
      }
    });
    for (let c = 0; c < consumers; c++) sim.spawn(`Indexer${c + 1}`, function* () {
      while (taken < total) {
        taken++;
        yield enter(m);
        while (st.count === 0) yield wait(m, 'notEmpty');
        const item = buf[st.out]; buf[st.out] = null; st.out = (st.out + 1) % size; st.count--; st.consumed.push(item);
        yield signal(m, 'notFull');
        yield exit(m);
        yield step(`index ${item}`);
      }
    });
  } else {
    // No synchronisation: busy-wait on count, and count++ / count-- are split read/write steps.
    for (let p = 0; p < producers; p++) sim.spawn(`Uploader${p + 1}`, function* () {
      for (let k = 0; k < itemsEach; k++) {
        const item = `doc${p + 1}.${k + 1}`;
        while (st.count >= size) yield step('spin: queue full');
        const slot = st.in;
        yield step(`read in=${slot}`);
        if (buf[slot] !== null) st.overflow++;
        buf[slot] = item; st.produced.push(item);
        st.in = (slot + 1) % size;
        const tmp = st.count;
        yield step(`read count=${tmp}`);
        st.count = tmp + 1;
        st.maxCount = Math.max(st.maxCount, st.count);
      }
    });
    for (let c = 0; c < consumers; c++) sim.spawn(`Indexer${c + 1}`, function* () {
      while (taken < total) {
        taken++;
        while (st.count <= 0) yield step('spin: queue empty');
        const slot = st.out;
        yield step(`read out=${slot}`);
        const item = buf[slot]; buf[slot] = null; st.consumed.push(item);
        st.out = (slot + 1) % size;
        const tmp = st.count;
        yield step(`read count=${tmp}`);
        st.count = tmp - 1;
      }
    });
  }
  const res = sim.run(maxSteps);
  const consumedReal = st.consumed.filter(Boolean);
  const unique = new Set(consumedReal);
  return {
    ...res,
    produced: st.produced.length,
    consumed: consumedReal.length,
    lost: st.produced.filter((x) => !unique.has(x)).length,
    duplicates: consumedReal.length - unique.size,
    emptyReads: st.consumed.length - consumedReal.length,
    overwritten: st.overflow,
    maxOccupancy: st.maxCount,
    correct: res.finished && consumedReal.length === total && unique.size === total && st.maxCount <= size,
  };
}

// ---------- Dining philosophers ----------
// strategy: 'naive' | 'ordered' (resource ordering) | 'waiter' (at most n-1 at the table) | 'asymmetric'
export function diningPhilosophers({ n = 5, meals = 3, strategy = 'naive', seed = 1, maxSteps = 6000 } = {}) {
  const sim = new Sim(seed);
  const forks = Array.from({ length: n }, (_, i) => sim.semaphore(`shard${i}`, 1));
  const room = sim.semaphore('room', n - 1);
  const eaten = new Array(n).fill(0);
  let concurrentMax = 0;
  let eating = 0;
  for (let i = 0; i < n; i++) {
    const left = i;
    const right = (i + 1) % n;
    let first = left;
    let second = right;
    if (strategy === 'ordered') { first = Math.min(left, right); second = Math.max(left, right); }
    if (strategy === 'asymmetric' && i % 2 === 1) { first = right; second = left; }
    sim.spawn(`Worker${i}`, function* () {
      for (let k = 0; k < meals; k++) {
        yield step('think (wait for work)');
        if (strategy === 'waiter') yield P(room);
        yield P(forks[first]);
        yield step(`locked shard${first}`);
        yield P(forks[second]);
        eating++; concurrentMax = Math.max(concurrentMax, eating);
        yield step(`merge shard${first}+shard${second}`);
        eating--; eaten[i]++;
        yield V(forks[second]);
        yield V(forks[first]);
        if (strategy === 'waiter') yield V(room);
      }
    });
  }
  const res = sim.run(maxSteps);
  return { ...res, eaten, meals: eaten.reduce((a, b) => a + b, 0), concurrentMax };
}

// ---------- Readers-writers ----------
// variant: 'readers' (first problem: readers preferred) | 'writers' (writers preferred) | 'fair' (FIFO turnstile)
export function readersWriters({ readers = 6, writers = 2, opsEach = 4, variant = 'readers', seed = 1, readGap = 0, writeGap = 10, maxSteps = 20000 } = {}) {
  const sim = new Sim(seed);
  const mutex = sim.semaphore('rcMutex', 1);
  const wmutex = sim.semaphore('wcMutex', 1);
  const resource = sim.semaphore('index', 1);
  const readTry = sim.semaphore('readTry', 1);
  const queue = sim.semaphore('serviceQueue', 1);
  let rc = 0;
  let wc = 0;
  let activeReaders = 0;
  let activeWriters = 0;
  let violations = 0;
  const waits = { reader: [], writer: [] };
  const check = () => { if (activeWriters > 1 || (activeWriters && activeReaders)) violations++; };

  for (let r = 0; r < readers; r++) sim.spawn(`Search${r + 1}`, function* () {
    for (let k = 0; k < opsEach; k++) {
      yield sleep(readGap + (r % 2));
      const asked = sim.clock;
      if (variant === 'writers') { yield P(readTry); }
      if (variant === 'fair') { yield P(queue); }
      yield P(mutex);
      rc++;
      if (rc === 1) yield P(resource);
      yield V(mutex);
      if (variant === 'writers') yield V(readTry);
      if (variant === 'fair') yield V(queue);
      waits.reader.push(sim.clock - asked);
      activeReaders++; check();
      yield step('read index');
      yield step('rank results');
      activeReaders--;
      yield P(mutex);
      rc--;
      if (rc === 0) yield V(resource);
      yield V(mutex);
    }
  });
  for (let w = 0; w < writers; w++) sim.spawn(`Indexer${w + 1}`, function* () {
    for (let k = 0; k < opsEach; k++) {
      yield sleep(writeGap);
      const asked = sim.clock;
      if (variant === 'writers') {
        yield P(wmutex); wc++; if (wc === 1) yield P(readTry); yield V(wmutex);
      }
      if (variant === 'fair') yield P(queue);
      yield P(resource);
      if (variant === 'fair') yield V(queue);
      waits.writer.push(sim.clock - asked);
      activeWriters++; check();
      yield step('update index');
      activeWriters--;
      yield V(resource);
      if (variant === 'writers') {
        yield P(wmutex); wc--; if (wc === 0) yield V(readTry); yield V(wmutex);
      }
    }
  });
  const res = sim.run(maxSteps);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  return {
    ...res,
    violations,
    readerAvgWait: avg(waits.reader), readerMaxWait: Math.max(0, ...waits.reader),
    writerAvgWait: avg(waits.writer), writerMaxWait: Math.max(0, ...waits.writer),
    reads: waits.reader.length, writes: waits.writer.length,
  };
}

// ---------- Sleeping barber ----------
export function sleepingBarber({ chairs = 3, customers = 12, serviceTime = 2, meanGap = 10, seed = 1 } = {}) {
  const sim = new Sim(seed);
  const custSem = sim.semaphore('customers', 0);
  const barberSem = sim.semaphore('barber', 0);
  const mutex = sim.semaphore('mutex', 1);
  let waiting = 0;
  let served = 0;
  let turnedAway = 0;
  let barberSleeps = 0;
  const waitTimes = [];
  sim.spawn('Converter', function* () {
    for (;;) {
      if (waiting === 0) barberSleeps++;
      yield P(custSem); // sleep until a job arrives
      yield P(mutex);
      waiting--;
      yield V(barberSem);
      yield V(mutex);
      for (let i = 0; i < serviceTime; i++) yield step('convert PDF');
      served++;
    }
  }, { daemon: true });
  let arrival = 0;
  for (let c = 0; c < customers; c++) {
    arrival += sim.rng.int(1, 2 * meanGap - 1);
    const at = arrival;
    sim.spawn(`Job${c + 1}`, function* () {
      yield sleep(at);
      yield P(mutex);
      if (waiting < chairs) {
        waiting++;
        const t0 = sim.clock;
        yield V(custSem);
        yield V(mutex);
        yield P(barberSem);
        waitTimes.push(sim.clock - t0);
        yield step('being converted');
      } else {
        turnedAway++;
        yield V(mutex);
        yield step('queue full - rejected, retry later');
      }
    });
  }
  const res = sim.run(20000);
  return { ...res, served, turnedAway, barberSleeps, avgWait: waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0 };
}

// Run a problem over many seeds to measure how often an interleaving goes wrong.
export function manySeeds(fn, opts, seeds = 200) {
  const out = [];
  for (let s = 1; s <= seeds; s++) out.push(fn({ ...opts, seed: s }));
  return out;
}
