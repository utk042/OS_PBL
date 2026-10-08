// Unit 3 case study: deadlock handling in database transaction managers
// (MySQL InnoDB, Oracle) applied to the repository's metadata database.
//
// Transactions use strict two-phase locking: shared (S) locks for reads,
// exclusive (X) locks for writes, all released at commit or rollback.
// Strategies compared:
//   detect-innodb : wait; a wait-for-graph check finds cycles and rolls back the
//                   transaction with the fewest locks (InnoDB picks the "lightest" trx)
//   detect-oracle : wait; on a cycle, the waiter that closed the cycle gets ORA-00060
//                   and its transaction is rolled back here
//   timeout       : no detection, a waiter gives up after `timeout` ticks (innodb_lock_wait_timeout)
//   wait-die      : non-preemptive, timestamp based: an older trx waits, a younger one dies
//   wound-wait    : preemptive: an older trx wounds (aborts) a younger holder, a younger one waits
//   ordered       : prevention: every trx locks its rows in one global order (breaks circular wait)
import { makeRng } from './rng.js';
import { findCycle } from './deadlock.js';

export const STRATEGIES = {
  'detect-innodb': 'Detection + rollback lightest trx (MySQL InnoDB)',
  'detect-oracle': 'Detection + rollback requester (Oracle ORA-00060)',
  timeout: 'Lock-wait timeout only',
  'wait-die': 'Wait-die (timestamps)',
  'wound-wait': 'Wound-wait (timestamps)',
  ordered: 'Ordered locking (prevention)',
};

// Operations of the repository that touch the same rows in different orders.
const TEMPLATES = [
  { name: 'Approve submission',   ops: (r) => [['X', `paper:${r.paper}`], ['X', `author:${r.author}`]] },
  { name: 'Edit author profile',  ops: (r) => [['X', `author:${r.author}`], ['X', `paper:${r.paper}`]] },
  { name: 'Download paper',       ops: (r) => [['S', `paper:${r.paper}`], ['X', 'stats:downloads']] },
  { name: 'Monthly usage report', ops: (r) => [['S', 'stats:downloads'], ['S', `author:${r.author}`], ['S', `paper:${r.paper}`]] },
  { name: 'Re-tag paper',         ops: (r) => [['X', `tag:${r.tag}`], ['X', `paper:${r.paper}`]] },
];

// `perTick` transactions arrive per time unit on average; higher means more concurrency and more conflicts.
export function makeWorkload({ count = 40, hotPapers = 3, authors = 3, tags = 2, seed = 7, perTick = 2 } = {}) {
  const rng = makeRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const tpl = TEMPLATES[rng.int(0, TEMPLATES.length - 1)];
    const r = { paper: rng.int(1, hotPapers), author: rng.int(1, authors), tag: rng.int(1, tags) };
    return { id: `T${i + 1}`, name: tpl.name, arrival: Math.floor(i / perTick), ops: tpl.ops(r) };
  });
}

export function simulateTransactions(workload, { strategy = 'detect-innodb', timeout = 6, backoff = 2, maxTicks = 5000 } = {}) {
  const txns = workload.map((w, i) => ({
    ...w,
    ops: strategy === 'ordered' ? orderOps(w.ops) : w.ops,
    ts: i, // start timestamp; kept across restarts so old transactions eventually win
    pc: 0, holds: new Map(), state: 'pending', waitingFor: null, waitSince: 0, restartAt: w.arrival,
    commit: null, aborts: 0, opsDone: 0,
  }));
  const locks = new Map(); // item -> Map(txnId -> mode)
  const byId = new Map(txns.map((t) => [t.id, t]));
  const log = [];
  let deadlocks = 0;
  let wasted = 0;

  const holdersOf = (item, except) => [...(locks.get(item) || new Map()).entries()].filter(([id]) => id !== except);
  const compatible = (item, mode, txn) => {
    const others = holdersOf(item, txn.id);
    if (!others.length) return true;
    return mode === 'S' && others.every(([, m]) => m === 'S');
  };
  const grant = (txn, item, mode) => {
    if (!locks.has(item)) locks.set(item, new Map());
    const cur = locks.get(item).get(txn.id);
    locks.get(item).set(txn.id, cur === 'X' ? 'X' : mode);
    txn.holds.set(item, locks.get(item).get(txn.id));
  };
  const releaseAll = (txn) => {
    for (const item of txn.holds.keys()) { locks.get(item).delete(txn.id); if (!locks.get(item).size) locks.delete(item); }
    txn.holds.clear();
  };
  const abort = (txn, t, why) => {
    log.push({ t, txn: txn.id, event: 'rollback', detail: why });
    wasted += txn.opsDone;
    releaseAll(txn);
    txn.aborts++;
    txn.pc = 0; txn.opsDone = 0; txn.waitingFor = null;
    txn.state = 'pending';
    txn.restartAt = t + backoff + txn.aborts; // growing backoff
  };

  let t = 0;
  for (; t < maxTicks && txns.some((x) => x.state !== 'committed'); t++) {
    for (const txn of txns) if (txn.state === 'pending' && txn.restartAt <= t) txn.state = 'active';
    for (const txn of txns) {
      if (txn.state !== 'active') continue;
      if (txn.pc === txn.ops.length) {
        releaseAll(txn); txn.state = 'committed'; txn.commit = t;
        log.push({ t, txn: txn.id, event: 'commit', detail: txn.name });
        continue;
      }
      const [mode, item] = txn.ops[txn.pc];
      if (compatible(item, mode, txn)) {
        grant(txn, item, mode);
        txn.pc++; txn.opsDone++; txn.waitingFor = null;
        continue;
      }
      const holders = holdersOf(item, txn.id).map(([id]) => byId.get(id));
      if (!txn.waitingFor) { txn.waitingFor = item; txn.waitSince = t; }
      if (strategy === 'wait-die') {
        if (!holders.every((h) => txn.ts < h.ts)) abort(txn, t, `dies: younger than holder of ${item}`);
      } else if (strategy === 'wound-wait') {
        for (const h of holders) if (txn.ts < h.ts) abort(h, t, `wounded by older ${txn.id} wanting ${item}`);
        if (compatible(item, mode, txn)) { grant(txn, item, mode); txn.pc++; txn.opsDone++; txn.waitingFor = null; }
      } else if (strategy === 'timeout' && t - txn.waitSince >= timeout) {
        abort(txn, t, `lock wait timeout on ${item}`);
      }
    }
    if (strategy.startsWith('detect')) {
      for (;;) {
        const waiting = txns.filter((x) => x.state === 'active' && x.waitingFor);
        const nodes = txns.filter((x) => x.state === 'active').map((x) => x.id);
        const edges = [];
        for (const w of waiting) for (const [h] of holdersOf(w.waitingFor, w.id)) edges.push([w.id, h]);
        const cycle = findCycle(nodes, edges);
        if (!cycle) break;
        deadlocks++;
        const members = cycle.map((id) => byId.get(id));
        const victim = strategy === 'detect-innodb'
          ? members.reduce((a, b) => (b.holds.size < a.holds.size || (b.holds.size === a.holds.size && b.ts > a.ts) ? b : a))
          : members.reduce((a, b) => (b.waitSince > a.waitSince || (b.waitSince === a.waitSince && b.ts > a.ts) ? b : a));
        log.push({ t, txn: victim.id, event: 'deadlock', detail: `cycle ${cycle.join(' -> ')} -> ${cycle[0]}` });
        abort(victim, t, strategy === 'detect-oracle' ? 'ORA-00060: deadlock detected' : 'ERROR 1213: Deadlock found; trx rolled back');
      }
    }
  }
  const committed = txns.filter((x) => x.commit !== null);
  const latency = committed.map((x) => x.commit - x.arrival);
  return {
    strategy,
    label: STRATEGIES[strategy],
    committed: committed.length,
    total: txns.length,
    aborts: txns.reduce((s, x) => s + x.aborts, 0),
    deadlocks,
    wastedOps: wasted,
    makespan: t,
    avgLatency: latency.length ? latency.reduce((a, b) => a + b, 0) / latency.length : 0,
    maxLatency: latency.length ? Math.max(...latency) : 0,
    finished: committed.length === txns.length,
    log,
  };
}

// Global lock order: by item name. A trx that reads and later writes the same row
// would need an upgrade; the templates never touch a row twice.
function orderOps(ops) {
  return [...ops].sort((a, b) => a[1].localeCompare(b[1]));
}

export function compareStrategies(workload, opts) {
  return Object.keys(STRATEGIES).map((s) => simulateTransactions(workload, { ...opts, strategy: s }));
}
