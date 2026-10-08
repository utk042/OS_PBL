import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAlgorithm } from '../assets/js/os/mutex.js';
import { boundedBuffer, diningPhilosophers, readersWriters, sleepingBarber, manySeeds } from '../assets/js/os/problems.js';

test('no synchronisation and lock variable lose updates', () => {
  for (const a of ['none', 'lock']) {
    const r = checkAlgorithm(a);
    assert.equal(r.mutualExclusion, false);
    assert.ok(r.finalCounters.includes(1));
  }
});

test('strict alternation keeps mutual exclusion but violates progress', () => {
  const r = checkAlgorithm('strict', { rounds: [1, 2] });
  assert.equal(r.mutualExclusion, true);
  assert.equal(r.progress, false);
});

test('Peterson, Bakery, TSL and semaphore are correct for every interleaving', () => {
  for (const a of ['peterson', 'bakery', 'tsl', 'semaphore']) {
    for (const rounds of [[1, 2], [2, 2]]) {
      const r = checkAlgorithm(a, { rounds });
      assert.ok(r.mutualExclusion && r.progress, `${a} ${rounds}`);
      assert.deepEqual(r.finalCounters, [rounds[0] + rounds[1]]);
    }
  }
});

test('bounded buffer: semaphore and monitor versions are always correct', () => {
  for (const impl of ['semaphore', 'monitor']) {
    assert.ok(manySeeds(boundedBuffer, { impl }, 100).every((r) => r.correct), impl);
  }
});

test('bounded buffer without synchronisation goes wrong', () => {
  assert.ok(manySeeds(boundedBuffer, { impl: 'unsynchronized' }, 50).some((r) => !r.correct));
});

test('dining philosophers: naive version can deadlock, fixes never do', () => {
  assert.ok(manySeeds(diningPhilosophers, { strategy: 'naive' }, 100).some((r) => r.deadlock));
  for (const strategy of ['ordered', 'waiter', 'asymmetric']) {
    const rs = manySeeds(diningPhilosophers, { strategy }, 100);
    assert.ok(rs.every((r) => !r.deadlock && r.meals === 15), strategy);
  }
});

test('readers-writers never lets a writer share the index', () => {
  for (const variant of ['readers', 'writers', 'fair']) {
    const rs = manySeeds(readersWriters, { variant }, 50);
    assert.ok(rs.every((r) => r.violations === 0 && r.finished), variant);
  }
});

test('sleeping barber: every job is either converted or rejected', () => {
  for (const r of manySeeds(sleepingBarber, { customers: 12 }, 50)) {
    assert.equal(r.served + r.turnedAway, 12);
    assert.equal(r.deadlock, null);
  }
});
