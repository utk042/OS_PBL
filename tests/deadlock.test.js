import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafe, requestResources, detectDeadlock, recover, findCycle, BANKER_EXAMPLE, DETECTION_EXAMPLE } from '../assets/js/os/deadlock.js';
import { makeWorkload, simulateTransactions, STRATEGIES } from '../assets/js/os/dbcase.js';

test("Banker's: classic Silberschatz example is safe with sequence P1 P3 P4 P0 P2", () => {
  const max = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]];
  const alloc = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]];
  const r = isSafe([3, 3, 2], max, alloc);
  assert.equal(r.safe, true);
  assert.deepEqual(r.sequence, [1, 3, 4, 0, 2]);
  // P1 requests (1,0,2): granted. P4 then requests (3,3,0): not enough available.
  const s = { available: [3, 3, 2], max, allocation: alloc };
  const g = requestResources(s, 1, [1, 0, 2]);
  assert.equal(g.granted, true);
  assert.equal(requestResources(g.state, 4, [3, 3, 0]).granted, false);
  assert.equal(requestResources(g.state, 0, [0, 2, 0]).granted, false); // unsafe
});

test("Banker's: request above declared need is an error", () => {
  const r = requestResources(BANKER_EXAMPLE, 3, [5, 0, 0, 0]);
  assert.equal(r.granted, false);
  assert.match(r.reason, /maximum/);
});

test('detection finds the deadlock and recovery breaks it with one victim', () => {
  const d = DETECTION_EXAMPLE;
  assert.equal(detectDeadlock(d.available, d.allocation, d.request).deadlocked.length, 5);
  const r = recover(d.available, d.allocation, d.request);
  assert.equal(r.victims.length, 1);
});

test('wait-for graph cycle detection', () => {
  assert.deepEqual(findCycle(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]), ['A', 'B', 'C']);
  assert.equal(findCycle(['A', 'B'], [['A', 'B']]), null);
});

test('every DB strategy commits every transaction; only detection reports deadlocks', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const w = makeWorkload({ seed });
    for (const s of Object.keys(STRATEGIES)) {
      const r = simulateTransactions(w, { strategy: s });
      assert.ok(r.finished, `${s} seed ${seed}`);
      if (!s.startsWith('detect')) assert.equal(r.deadlocks, 0);
    }
    assert.equal(simulateTransactions(w, { strategy: 'ordered' }).aborts, 0);
  }
});
